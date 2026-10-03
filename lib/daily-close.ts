// ปิดยอดประจำวัน 2 สาขา — ส่วนคำนวณล้วน (ไม่มี I/O) ใช้ได้ทั้งฝั่ง server, client และ test.
//
// กติกาที่เจ้าของร้านตั้ง (3 ต.ค. 2026): มี POS 2 เครื่อง (StoreHub คนละ store) แต่ K SHOP บัญชีเดียว
// จึงแยกเงินที่เข้า K SHOP ด้วยเศษสตางค์
//   • ยอดเต็มบาท (.00)        = หน้าร้านบางแค        → ลงเครื่องบางแค
//   • เศษ .80–.99             = หน้าร้านเสนาเฟสต์    → ลงเครื่องเสนาเฟสต์
//   • เศษ .01–.79             = ออนไลน์              → ลงเครื่องเสนาเฟสต์
// แต่ละสาขาปิดยอดของตัวเอง (เงินสดนับจากลิ้นชักจริง เพราะเงินสดไม่ผ่าน K SHOP)
// แล้วยอด K SHOP ของสองเครื่องรวมกันต้องตรงกับยอดที่ธนาคารสรุปของวันนั้น.
//
// ธนาคารตัดรอบ K SHOP 23:00 น. → "วันธนาคาร" D = 23:00 ของวันก่อน ถึง 23:00 ของวัน D (เวลาไทย)
// ส่วนเงินสดของแต่ละสาขาใช้วันปฏิทินปกติ (ร้านปิด 22:00 อยู่แล้ว)

export const KSHOP_METHOD = "K-Shop";
export const CASH_METHOD = "Cash";

export type SatangBucket = "whole" | "store" | "online";

export const SATANG_BUCKET_LABEL: Record<SatangBucket, string> = {
  whole: "หน้าร้านบางแค (.00)",
  store: "หน้าร้านเสนาเฟสต์ (.80–.99)",
  online: "ออนไลน์ (.01–.79)"
};

/** สาขาที่ควรลงบิล K SHOP ตามเศษสตางค์ */
export const BUCKET_BRANCH: Record<SatangBucket, string> = {
  whole: "bangkae",
  store: "senafest",
  online: "senafest"
};

export type PosPayment = { paymentMethod: string; amount: number };

/** บิลจาก StoreHub GET /transactions (เฉพาะฟิลด์ที่ใช้) */
export type PosTransaction = {
  refId: string;
  invoiceNumber?: string;
  storeId: string;
  transactionType: string; // "Sale" | "Return"
  transactionTime: string; // ISO UTC
  total: number;
  isCancelled?: boolean;
  channel?: string;
  payments?: PosPayment[];
};

export function cents(amount: number): number {
  return Math.round(Math.abs(amount) * 100) % 100;
}

export function satangBucket(amount: number): SatangBucket {
  const c = cents(amount);
  if (c === 0) return "whole";
  if (c >= 80) return "store";
  return "online";
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const BKK_MS = 7 * 60 * 60 * 1000;

/** ช่วงเวลา (ms) ของวันปฏิทิน D เวลาไทย */
export function calendarDayWindow(workDate: string): { from: number; to: number } {
  const from = Date.parse(`${workDate}T00:00:00+07:00`);
  return { from, to: from + 24 * 60 * 60 * 1000 };
}

/** ช่วงเวลา (ms) ของ "วันธนาคาร" D: 23:00 ของวันก่อน → 23:00 ของวัน D (ตามรอบตัดยอด K SHOP) */
export function bankDayWindow(workDate: string): { from: number; to: number } {
  const to = Date.parse(`${workDate}T23:00:00+07:00`);
  return { from: to - 24 * 60 * 60 * 1000, to };
}

export function addDays(workDate: string, days: number): string {
  return new Date(Date.parse(`${workDate}T12:00:00+07:00`) + days * 24 * 60 * 60 * 1000 + BKK_MS).toISOString().slice(0, 10);
}

export function bangkokDateOf(iso: string): string {
  return new Date(Date.parse(iso) + BKK_MS).toISOString().slice(0, 10);
}

export function bangkokTimeOf(iso: string): string {
  return new Date(Date.parse(iso) + BKK_MS).toISOString().slice(11, 16);
}

function inWindow(tx: PosTransaction, window: { from: number; to: number }): boolean {
  const at = Date.parse(tx.transactionTime);
  return at >= window.from && at < window.to;
}

/** บิลคืนสินค้านับเป็นลบ · บิลที่ยกเลิกไม่นับ */
function signedPayments(tx: PosTransaction): PosPayment[] {
  if (tx.isCancelled) return [];
  const sign = tx.transactionType === "Return" ? -1 : 1;
  const payments = tx.payments?.length ? tx.payments : [{ paymentMethod: "ไม่ระบุ", amount: tx.total }];
  return payments.map((payment) => ({ paymentMethod: payment.paymentMethod || "ไม่ระบุ", amount: sign * (Number(payment.amount) || 0) }));
}

export type KshopBill = {
  refId: string;
  invoiceNumber: string;
  time: string; // HH:MM เวลาไทย
  date: string; // YYYY-MM-DD เวลาไทย
  amount: number;
  bucket: SatangBucket;
};

export type PosSummary = {
  bills: number;
  cancelledBills: number;
  /** ยอดสุทธิต่อวิธีชำระ (ขาย − คืน) */
  byMethod: Record<string, number>;
  total: number;
  cash: number;
  kshop: { total: number; whole: number; store: number; online: number; bills: KshopBill[] };
};

export function summarizePos(transactions: PosTransaction[], storeId: string, window: { from: number; to: number }): PosSummary {
  const summary: PosSummary = {
    bills: 0,
    cancelledBills: 0,
    byMethod: {},
    total: 0,
    cash: 0,
    kshop: { total: 0, whole: 0, store: 0, online: 0, bills: [] }
  };
  for (const tx of transactions) {
    if (tx.storeId !== storeId || !inWindow(tx, window)) continue;
    if (tx.isCancelled) {
      summary.cancelledBills += 1;
      continue;
    }
    summary.bills += 1;
    for (const payment of signedPayments(tx)) {
      summary.byMethod[payment.paymentMethod] = round2((summary.byMethod[payment.paymentMethod] ?? 0) + payment.amount);
      summary.total = round2(summary.total + payment.amount);
      if (payment.paymentMethod === CASH_METHOD) summary.cash = round2(summary.cash + payment.amount);
      if (payment.paymentMethod === KSHOP_METHOD && payment.amount !== 0) {
        const bucket = satangBucket(payment.amount);
        summary.kshop.total = round2(summary.kshop.total + payment.amount);
        summary.kshop[bucket] = round2(summary.kshop[bucket] + payment.amount);
        summary.kshop.bills.push({
          refId: tx.refId,
          invoiceNumber: tx.invoiceNumber || "",
          time: bangkokTimeOf(tx.transactionTime),
          date: bangkokDateOf(tx.transactionTime),
          amount: payment.amount,
          bucket
        });
      }
    }
  }
  summary.kshop.bills.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return summary;
}

export type RuleIssue = { invoiceNumber: string; time: string; amount: number; message: string };

/** บิล K SHOP ที่เศษสตางค์ไม่ตรงกับเครื่องที่ลง — ทำให้ตอนรวมยอดแยกไม่ออกว่าเงินของสาขาไหน */
export function satangRuleIssues(branch: string, bills: KshopBill[]): RuleIssue[] {
  const issues: RuleIssue[] = [];
  for (const bill of bills) {
    if (bill.amount < 0) continue; // บิลคืนเงินไม่เช็คเศษ
    const owner = BUCKET_BRANCH[bill.bucket];
    if (owner === branch) continue;
    const message =
      branch === "senafest"
        ? "ยอดเต็มบาทเป็นของบางแค — เสนาฯ ต้องเติมเศษ .80–.99 (หน้าร้าน) หรือ .01–.79 (ออนไลน์)"
        : bill.bucket === "online"
          ? "เศษ .01–.79 = ออนไลน์ ต้องลงที่เครื่องเสนาเฟสต์"
          : "เศษ .80–.99 = หน้าร้านเสนาเฟสต์ ลงผิดเครื่อง?";
    issues.push({ invoiceNumber: bill.invoiceNumber, time: bill.time, amount: bill.amount, message });
  }
  return issues;
}

// ── เงินสด ──────────────────────────────────────────────────────────────────

export const CASH_DENOMINATIONS = [1000, 500, 100, 50, 20, 10, 5, 2, 1] as const;

export type PaidOut = { amount: number; note: string };

export type CashInput = {
  /** เงินทอนในลิ้นชักตอนเปิดร้าน */
  openingFloat: number;
  /** นับเงินในลิ้นชักตอนปิด: จำนวนใบ/เหรียญต่อชนิด (key = ราคา) */
  counts: Record<string, number>;
  /** เงินสดที่หยิบจ่ายออกระหว่างวัน (ซื้อของ ฯลฯ) */
  paidOuts: PaidOut[];
  /** เงินทอนที่เหลือไว้ในลิ้นชักสำหรับพรุ่งนี้ */
  floatKept: number;
};

export function countedCash(counts: Record<string, number>): number {
  return round2(CASH_DENOMINATIONS.reduce((sum, value) => sum + value * Math.max(0, Math.floor(Number(counts[String(value)]) || 0)), 0));
}

export type CashResult = {
  counted: number;
  paidOutTotal: number;
  /** เงินที่ควรมีในลิ้นชัก = เงินทอนตั้งต้น + ขายเงินสด − จ่ายออก */
  expected: number;
  /** นับได้ − ควรมี (บวก = เกิน, ลบ = ขาด) */
  diff: number;
  /** เงินที่ต้องนำส่งเจ้าของ = นับได้ − เงินทอนที่เก็บไว้ */
  handover: number;
};

export function computeCash(input: CashInput, posCash: number): CashResult {
  const counted = countedCash(input.counts);
  const paidOutTotal = round2(input.paidOuts.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
  const expected = round2((Number(input.openingFloat) || 0) + posCash - paidOutTotal);
  return {
    counted,
    paidOutTotal,
    expected,
    diff: round2(counted - expected),
    handover: round2(counted - (Number(input.floatKept) || 0))
  };
}

export type CloseProblem = string;

/** เช็คก่อนกดปิดยอด — คืนข้อความที่ต้องแก้ (ว่าง = ปิดได้) */
export function closeProblems(input: CashInput, cash: CashResult, note: string): CloseProblem[] {
  const problems: CloseProblem[] = [];
  if (input.paidOuts.some((item) => (Number(item.amount) || 0) > 0 && !item.note.trim())) {
    problems.push("เงินสดจ่ายออกทุกรายการต้องเขียนว่าจ่ายค่าอะไร");
  }
  if ((Number(input.floatKept) || 0) > cash.counted) problems.push("เงินทอนที่เก็บไว้มากกว่าเงินที่นับได้");
  if (cash.diff !== 0 && note.trim().length < 5) problems.push("เงินสดไม่ตรง — ต้องเขียนหมายเหตุว่าเกิดจากอะไร");
  return problems;
}

// ── รวมสองสาขากับ K SHOP ─────────────────────────────────────────────────────

export type MoneyIn = { amount: number; at: string; payer?: string };

export type KshopReconcile = {
  /** ยอด K SHOP จากเครื่อง POS ทุกสาขารวมกัน (วันธนาคาร) */
  posTotal: number;
  byBucket: Record<SatangBucket, number>;
  /** ยอดที่ธนาคารสรุป (ใส่จากเมล K SHOP) — null = ยังไม่มี */
  bankTotal: number | null;
  diff: number | null;
  /** โนติเงินเข้าที่หาบิลยอดเดียวกันไม่เจอ — มีแนวโน้มว่าลืมลงบิล หรือลงยอดผิด */
  moneyInWithoutBill: MoneyIn[];
  /** บิล K SHOP ที่ไม่มีโนติยอดเดียวกัน — โนติจากมือถือร้านตกหล่นได้ ใช้เป็นแค่เบาะแส */
  billsWithoutMoneyIn: Array<KshopBill & { branch: string }>;
};

export function reconcileKshop(
  billsByBranch: Record<string, KshopBill[]>,
  moneyIn: MoneyIn[],
  bankTotal: number | null
): KshopReconcile {
  const all = Object.entries(billsByBranch).flatMap(([branch, bills]) => bills.map((bill) => ({ ...bill, branch })));
  const byBucket: Record<SatangBucket, number> = { whole: 0, store: 0, online: 0 };
  let posTotal = 0;
  for (const bill of all) {
    posTotal = round2(posTotal + bill.amount);
    byBucket[bill.bucket] = round2(byBucket[bill.bucket] + bill.amount);
  }
  // จับคู่ยอดตรงกันแบบหนึ่งต่อหนึ่ง (ยอดซ้ำกันหลายใบก็จับทีละใบ)
  const pool = new Map<number, number>();
  for (const bill of all) if (bill.amount > 0) pool.set(Math.round(bill.amount * 100), (pool.get(Math.round(bill.amount * 100)) ?? 0) + 1);
  const moneyInWithoutBill: MoneyIn[] = [];
  const seen = new Map<number, number>();
  for (const item of moneyIn) {
    const key = Math.round(item.amount * 100);
    const left = pool.get(key) ?? 0;
    if (left > 0) {
      pool.set(key, left - 1);
      seen.set(key, (seen.get(key) ?? 0) + 1);
    } else moneyInWithoutBill.push(item);
  }
  const billsWithoutMoneyIn: Array<KshopBill & { branch: string }> = [];
  for (const bill of all) {
    if (bill.amount <= 0) continue;
    const key = Math.round(bill.amount * 100);
    const matched = seen.get(key) ?? 0;
    if (matched > 0) seen.set(key, matched - 1);
    else billsWithoutMoneyIn.push(bill);
  }
  return {
    posTotal,
    byBucket,
    bankTotal,
    diff: bankTotal === null ? null : round2(bankTotal - posTotal),
    moneyInWithoutBill,
    billsWithoutMoneyIn
  };
}

// ── เอกสารที่เก็บ ─────────────────────────────────────────────────────────────

export const DAILY_CLOSE_COLLECTION = "sop_daily_close";
export const KSHOP_DAILY_COLLECTION = "sop_kshop_daily";

export type DailyCloseVersion = {
  cash: CashInput;
  result: CashResult;
  posCash: number;
  posByMethod: Record<string, number>;
  kshop: { total: number; whole: number; store: number; online: number };
  note: string;
  closedBy: string;
  closedByName: string;
  closedAt: string;
};

/** sop_daily_close/{branch}__{date} — ปิดซ้ำได้ แต่ทุกครั้งเก็บประวัติไว้ (เงินสดต้องย้อนดูได้เสมอ) */
export type DailyCloseDoc = DailyCloseVersion & {
  branch: string;
  workDate: string;
  history: DailyCloseVersion[];
};

export function dailyCloseId(branch: string, workDate: string): string {
  return `${branch}__${workDate}`;
}
