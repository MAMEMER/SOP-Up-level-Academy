import "server-only";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import { hasStoreHubCreds, storeHubGet } from "./storehub-api.ts";
import { allBranchKeys, branchConfig } from "./store-config.ts";
import {
  DAILY_CLOSE_COLLECTION,
  KSHOP_DAILY_COLLECTION,
  addDays,
  bankDayWindow,
  calendarDayWindow,
  dailyCloseId,
  reconcileKshop,
  satangRuleIssues,
  summarizePos,
  type DailyCloseDoc,
  type KshopReconcile,
  type MoneyIn,
  type PosSummary,
  type PosTransaction,
  type RuleIssue
} from "./daily-close.ts";

// ดึงบิลจาก StoreHub ครั้งเดียวต่อวัน (ครอบทั้งวันธนาคารและวันปฏิทิน) แล้วแคชสั้นๆ —
// StoreHub จำกัด 3 ครั้ง/วินาที และหน้าปิดยอดสองสาขาเปิดพร้อมกันได้
const TX_TTL_MS = 60 * 1000;
const txCache = new Map<string, { at: number; rows: PosTransaction[] }>();

async function fetchPosTransactions(workDate: string): Promise<PosTransaction[]> {
  const hit = txCache.get(workDate);
  if (hit && Date.now() - hit.at < TX_TTL_MS) return hit.rows;
  const from = new Date(bankDayWindow(workDate).from).toISOString();
  const to = new Date(calendarDayWindow(workDate).to).toISOString();
  const raw = await storeHubGet<PosTransaction[]>(`/transactions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  const rows = Array.isArray(raw) ? raw : [];
  txCache.set(workDate, { at: Date.now(), rows });
  return rows;
}

function storeIdOf(branch: string): string {
  const id = branchConfig(branch).storeHubStoreId;
  if (!id) throw new Error(`สาขา ${branch} ยังไม่ผูก StoreHub store`);
  return id;
}

export type BranchDay = {
  branch: string;
  workDate: string;
  pos: PosSummary | null;
  posError: string | null;
  ruleIssues: RuleIssue[];
  close: DailyCloseDoc | null;
  /** เงินทอนที่สาขานี้เก็บไว้เมื่อวาน — ใช้เป็นค่าเริ่มต้นของเงินทอนตั้งต้นวันนี้ */
  suggestedFloat: number | null;
};

export async function getBranchDay(branch: string, workDate: string): Promise<BranchDay> {
  let pos: PosSummary | null = null;
  let posError: string | null = null;
  if (!hasStoreHubCreds()) posError = "ยังไม่ได้ตั้งค่าเชื่อม StoreHub บนเซิร์ฟเวอร์";
  else {
    try {
      pos = summarizePos(await fetchPosTransactions(workDate), storeIdOf(branch), calendarDayWindow(workDate));
    } catch (error) {
      posError = error instanceof Error ? error.message : String(error);
    }
  }
  let close: DailyCloseDoc | null = null;
  let suggestedFloat: number | null = null;
  if (hasAdminCredentials()) {
    const [today, yesterday] = await Promise.all([
      adminDb().collection(DAILY_CLOSE_COLLECTION).doc(dailyCloseId(branch, workDate)).get(),
      adminDb().collection(DAILY_CLOSE_COLLECTION).doc(dailyCloseId(branch, addDays(workDate, -1))).get()
    ]);
    close = today.exists ? (today.data() as DailyCloseDoc) : null;
    if (yesterday.exists) suggestedFloat = Number((yesterday.data() as DailyCloseDoc).cash?.floatKept) || 0;
  }
  return { branch, workDate, pos, posError, ruleIssues: pos ? satangRuleIssues(branch, pos.kshop.bills) : [], close, suggestedFloat };
}

export type OwnerDay = {
  workDate: string;
  branches: BranchDay[];
  kshop: KshopReconcile | null;
  kshopError: string | null;
  bank: { amount: number; enteredBy: string; enteredAt: string } | null;
  moneyInCount: number;
};

async function moneyInForBankDay(workDate: string): Promise<MoneyIn[]> {
  const window = bankDayWindow(workDate);
  const snap = await adminDb()
    .collection("money_in")
    .where("day", ">=", addDays(workDate, -1))
    .where("day", "<=", workDate)
    .get();
  return snap.docs
    .map((doc) => doc.data() as { amount?: number; at?: { toMillis?: () => number }; payer?: string })
    .map((row) => ({ amount: Number(row.amount) || 0, ms: row.at?.toMillis?.() ?? 0, payer: row.payer || "" }))
    .filter((row) => row.amount > 0 && row.ms >= window.from && row.ms < window.to)
    .sort((a, b) => a.ms - b.ms)
    .map((row) => ({ amount: row.amount, at: new Date(row.ms).toISOString(), payer: row.payer }));
}

/** ภาพรวมของเจ้าของ: ทุกสาขา + ยอด K SHOP รวม (วันธนาคาร) เทียบยอดที่ธนาคารสรุป */
export async function getOwnerDay(workDate: string): Promise<OwnerDay> {
  const branches = await Promise.all(allBranchKeys().map((branch) => getBranchDay(branch, workDate)));
  let kshop: KshopReconcile | null = null;
  let kshopError: string | null = null;
  let bank: OwnerDay["bank"] = null;
  let moneyIn: MoneyIn[] = [];
  if (hasAdminCredentials()) {
    const bankSnap = await adminDb().collection(KSHOP_DAILY_COLLECTION).doc(workDate).get();
    if (bankSnap.exists) {
      const data = bankSnap.data() as { amount?: number; enteredBy?: string; enteredAt?: string };
      bank = { amount: Number(data.amount) || 0, enteredBy: data.enteredBy || "", enteredAt: data.enteredAt || "" };
    }
    moneyIn = await moneyInForBankDay(workDate).catch(() => []);
  }
  try {
    const transactions = await fetchPosTransactions(workDate);
    const window = bankDayWindow(workDate);
    const billsByBranch = Object.fromEntries(
      allBranchKeys().map((branch) => [branch, summarizePos(transactions, storeIdOf(branch), window).kshop.bills])
    );
    kshop = reconcileKshop(billsByBranch, moneyIn, bank ? bank.amount : null);
  } catch (error) {
    kshopError = error instanceof Error ? error.message : String(error);
  }
  return { workDate, branches, kshop, kshopError, bank, moneyInCount: moneyIn.length };
}
