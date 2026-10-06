// ของเติมสต็อกที่สั่งไปแล้ว (Makro / ซัพพลายเออร์น้ำ-ขนม-อุปกรณ์) — กติกาล้วน ไม่แตะ Firestore/DOM.
//
// Flow ที่แชมป์วางไว้ (กันสั่งซ้ำ + รับของให้ครบ):
//   1. คนสั่งของ อัปรูปรายการที่สั่งไปทั้งหมด (บิล/แคปหน้าจอ) → ระบบอ่านรูปแล้วแตกเป็นรายการ
//      ให้คนสั่งตรวจ/แก้ก่อนบันทึก → หน้า "ของที่ต้องสั่ง" ขึ้นว่า "สั่งแล้ว รอของมาส่ง" ไม่สั่งซ้ำ
//   2. ของมาส่ง → คนรับของเปิดเช็คลิสต์ Stock ข้อ "รับของเติมสต็อก" → เลือกออเดอร์ →
//      ติ๊กทีละรายการว่าตรงไหม · ไม่ตรง = บอกว่าขาด/เกิน/ผิด/เสียหาย/ไม่มา + ได้มากี่ชิ้น + โน้ต
//   3. รับครบทุกรายการ → "รับของเสร็จ". มีรายการไม่ตรง = ต้องติดต่อซัพ:
//      เช็คลิสต์ "ติดต่อแล้วหรือยัง" → "ได้เรื่องว่าอย่างไร" → "งานถัดไป"
//      (ซัพส่งที่ขาดตามมา = เปิดออเดอร์ค้างส่งใหม่ให้รอรับรอบหน้า · คืนเงิน/ลดบิล · ส่งของคืน · รับไว้ตามนี้)
//
// ไม่ผูก KPI (เตือนอย่างเดียว) — ถ้าจะหักคะแนนต้องขออนุมัติแชมป์ก่อน.

export const SUPPLY_ORDER_COLLECTION = "sop_supply_orders";

export const DEFAULT_SUPPLY_BRANCH = "bangkae";

/** ผลเช็คของรายการหนึ่งตอนรับ */
export type SupplyCheck = "ok" | "short" | "over" | "wrong" | "damaged" | "missing";

export const SUPPLY_CHECK_LABEL: Record<SupplyCheck, string> = {
  ok: "ตรง",
  short: "ขาด",
  over: "เกิน",
  wrong: "ได้ผิดของ",
  damaged: "เสียหาย",
  missing: "ไม่มา"
};

/** ปัญหาที่เลือกได้ตอนกด "ไม่ตรง" (เรียงตามที่เจอบ่อย) */
export const SUPPLY_PROBLEM_CHECKS: SupplyCheck[] = ["short", "missing", "over", "wrong", "damaged"];

export type SupplyItem = {
  id: string;
  name: string;
  qty: number;
  /** หน่วย เช่น แพ็ค ลัง ขวด (ไม่บังคับ) */
  unit?: string;
  /** StoreHub productId ที่จับคู่ได้ — ใช้ขึ้น "สั่งแล้ว รอส่ง" ในหน้าของที่ต้องสั่ง */
  productId?: string;
  check?: SupplyCheck;
  /** ได้มาจริงกี่ชิ้น (กรอกเมื่อไม่ตรง) */
  receivedQty?: number;
  checkNote?: string;
  checkedBy?: string;
  checkedAt?: string;
};

/** งานถัดไปหลังคุยกับซัพ */
export type SupplyNextStep = "resend" | "refund" | "return" | "accept" | "other";

export const SUPPLY_NEXT_STEP_LABEL: Record<SupplyNextStep, string> = {
  resend: "ซัพส่งของที่ขาด/ผิดมาให้ใหม่",
  refund: "ซัพคืนเงิน / ลดบิล",
  return: "ส่งของที่เกิน/ผิดคืนซัพ",
  accept: "รับไว้ตามนี้ ไม่ต้องทำอะไรต่อ",
  other: "อื่นๆ"
};

/** งานถัดไปที่จบในตัว (ไม่ต้องมีคนมาติ๊กว่าทำเสร็จ) */
const SELF_CLOSING_STEPS: SupplyNextStep[] = ["resend", "accept"];

export type SupplyFollowUp = {
  /** ติดต่อซัพแล้ว */
  contactedAt?: string;
  contactedBy?: string;
  /** ช่องทาง เช่น โทร LINE หน้าร้าน */
  channel?: string;
  /** ได้เรื่องว่าอย่างไร */
  outcome?: string;
  nextStep?: SupplyNextStep;
  nextNote?: string;
  /** วันที่ซัพบอกว่าจะส่ง/คืนเงิน (YYYY-MM-DD ไม่บังคับ) */
  nextDueDate?: string;
  decidedAt?: string;
  decidedBy?: string;
  /** งานถัดไปทำเสร็จแล้ว (ได้เงินคืน / ส่งคืนแล้ว / อื่นๆ) */
  doneAt?: string;
  doneBy?: string;
  doneNote?: string;
  /** ออเดอร์ค้างส่งที่เปิดให้ (nextStep = resend) */
  backorderId?: string;
};

export type SupplyOrder = {
  id: string;
  branch: string;
  supplier: string;
  /** วันที่สั่ง (YYYY-MM-DD เวลาไทย) */
  orderedDate: string;
  /** รูปรายการที่สั่ง (บิล / แคปหน้าจอแอป) */
  photos: string[];
  items: SupplyItem[];
  note?: string;
  /** ยอดรวมบิล (บาท ไม่บังคับ) */
  total?: number;
  /** รายการมาจากระบบอ่านรูป (แล้วคนสั่งตรวจ) */
  aiRead?: boolean;
  createdBy: string;
  createdAt: string;
  /** รับของเสร็จ (เช็คครบทุกรายการแล้ว) */
  receivedDate?: string;
  receivedAt?: string;
  receivedBy?: string;
  /** รูปของที่มาส่ง / ใบส่งของ */
  deliveryPhotos?: string[];
  receiveNote?: string;
  followUp?: SupplyFollowUp;
  /** ออเดอร์ค้างส่ง — มาจากออเดอร์ไหน */
  parentId?: string;
  cancelled?: boolean;
  cancelledBy?: string;
  cancelledAt?: string;
};

/**
 * waiting   = สั่งแล้ว รอของมาส่ง (ยังไม่มีใครเริ่มเช็ค)
 * receiving = ของมาแล้ว กำลังเช็คทีละรายการ
 * contact   = รับเสร็จแต่มีของไม่ตรง — ยังไม่ได้ติดต่อซัพ
 * followup  = ติดต่อแล้ว รอผล / รองานถัดไปให้เสร็จ
 * done      = จบ
 * cancelled = ยกเลิก
 */
export type SupplyState = "waiting" | "receiving" | "contact" | "followup" | "done" | "cancelled";

export const SUPPLY_STATE_LABEL: Record<SupplyState, string> = {
  waiting: "สั่งแล้ว รอของมาส่ง",
  receiving: "กำลังรับของ",
  contact: "ของไม่ตรง ต้องติดต่อซัพ",
  followup: "ติดต่อซัพแล้ว รอผล",
  done: "เรียบร้อย",
  cancelled: "ยกเลิก"
};

// ── วันที่ ─────────────────────────────────────────────────────────────────

export function bangkokDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00+07:00`) - Date.parse(`${a}T12:00:00+07:00`)) / 86_400_000);
}

// ── สถานะ ──────────────────────────────────────────────────────────────────

export function itemIsProblem(item: SupplyItem): boolean {
  return Boolean(item.check && item.check !== "ok");
}

export function problemItems(order: Pick<SupplyOrder, "items">): SupplyItem[] {
  return order.items.filter(itemIsProblem);
}

export function allItemsChecked(order: Pick<SupplyOrder, "items">): boolean {
  return order.items.length > 0 && order.items.every((item) => Boolean(item.check));
}

export function followUpClosed(followUp: SupplyFollowUp | undefined): boolean {
  if (!followUp?.contactedAt || !followUp.nextStep) return false;
  return SELF_CLOSING_STEPS.includes(followUp.nextStep) || Boolean(followUp.doneAt);
}

export function supplyState(order: SupplyOrder): SupplyState {
  if (order.cancelled) return "cancelled";
  if (!order.receivedDate) return order.items.some((item) => item.check) ? "receiving" : "waiting";
  if (!problemItems(order).length) return "done";
  if (!order.followUp?.contactedAt) return "contact";
  return followUpClosed(order.followUp) ? "done" : "followup";
}

export function supplyIsOpen(order: SupplyOrder): boolean {
  const state = supplyState(order);
  return state !== "done" && state !== "cancelled";
}

/** ยังไม่ได้รับของ = ของพวกนี้ "สั่งแล้ว รอส่ง" ห้ามสั่งซ้ำ */
export function awaitingDelivery(order: SupplyOrder): boolean {
  const state = supplyState(order);
  return state === "waiting" || state === "receiving";
}

const STATE_ORDER: Record<SupplyState, number> = {
  receiving: 0,
  contact: 1,
  waiting: 2,
  followup: 3,
  done: 4,
  cancelled: 5
};

export function sortSupplyOrders(orders: SupplyOrder[]): SupplyOrder[] {
  return [...orders].sort((left, right) => {
    const byState = STATE_ORDER[supplyState(left)] - STATE_ORDER[supplyState(right)];
    if (byState !== 0) return byState;
    return left.orderedDate.localeCompare(right.orderedDate);
  });
}

export function supplyStatusText(order: SupplyOrder, today: string): string {
  const state = supplyState(order);
  if (state === "waiting") {
    const days = daysBetween(order.orderedDate, today);
    return days <= 0 ? "สั่งวันนี้ รอของมาส่ง" : `สั่งไป ${days} วันแล้ว รอของมาส่ง`;
  }
  if (state === "receiving") {
    const done = order.items.filter((item) => item.check).length;
    return `กำลังเช็ค ${done}/${order.items.length} รายการ`;
  }
  if (state === "contact") return `ไม่ตรง ${problemItems(order).length} รายการ — ต้องติดต่อซัพ`;
  if (state === "followup") {
    const step = order.followUp?.nextStep;
    if (!step) return "ติดต่อซัพแล้ว — รอสรุปว่าจะทำอะไรต่อ";
    const due = order.followUp?.nextDueDate ? ` (นัด ${order.followUp.nextDueDate})` : "";
    return `รอ: ${SUPPLY_NEXT_STEP_LABEL[step]}${due}`;
  }
  return SUPPLY_STATE_LABEL[state];
}

export type SupplyCounts = Record<Exclude<SupplyState, "done" | "cancelled">, number>;

export function supplyCounts(orders: SupplyOrder[]): SupplyCounts {
  const counts: SupplyCounts = { waiting: 0, receiving: 0, contact: 0, followup: 0 };
  for (const order of orders) {
    const state = supplyState(order);
    if (state in counts) counts[state as keyof SupplyCounts] += 1;
  }
  return counts;
}

/** คำอธิบายสั้นของรายการที่ไม่ตรง เช่น "ขาด (สั่ง 6 ได้ 4) · กล่องบุบ" */
export function itemProblemText(item: SupplyItem): string {
  if (!item.check || item.check === "ok") return "";
  const parts: string[] = [SUPPLY_CHECK_LABEL[item.check]];
  if (typeof item.receivedQty === "number" && (item.check === "short" || item.check === "over")) {
    parts[0] += ` (สั่ง ${item.qty} ได้ ${item.receivedQty})`;
  }
  if (item.checkNote) parts.push(item.checkNote);
  return parts.join(" · ");
}

// ── ออเดอร์ค้างส่ง ──────────────────────────────────────────────────────────

/** จำนวนที่ยังขาด (ใช้เปิดออเดอร์ค้างส่ง) — เกิน/รับไว้แล้วไม่ต้องส่งเพิ่ม */
export function outstandingQty(item: SupplyItem): number {
  if (item.check === "missing" || item.check === "wrong" || item.check === "damaged") {
    if (item.check !== "missing" && typeof item.receivedQty === "number") return Math.max(item.qty - item.receivedQty, 0) || item.qty;
    return item.qty;
  }
  if (item.check === "short") {
    const got = typeof item.receivedQty === "number" ? item.receivedQty : 0;
    return Math.max(item.qty - got, 0);
  }
  return 0;
}

/** รายการที่ซัพต้องส่งตามมา — ออเดอร์ค้างส่งเริ่มจากรายการพวกนี้ (ยังไม่ได้เช็ค) */
export function backorderItems(order: SupplyOrder, makeId: (index: number) => string): SupplyItem[] {
  const out: SupplyItem[] = [];
  for (const item of order.items) {
    const qty = outstandingQty(item);
    if (qty <= 0) continue;
    const next: SupplyItem = { id: makeId(out.length), name: item.name, qty };
    if (item.unit) next.unit = item.unit;
    if (item.productId) next.productId = item.productId;
    out.push(next);
  }
  return out;
}

// ── กันสั่งซ้ำ: จับคู่กับรายการ "ของที่ต้องสั่ง" ─────────────────────────────

export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s\-_.,/()[\]x×*]+/g, "")
    .trim();
}

export type PendingSupply = {
  productId?: string;
  name: string;
  qty: number;
  orderedDate: string;
  orderId: string;
  supplier: string;
};

/** ทุกรายการในออเดอร์ที่ยังไม่ได้รับของ */
export function pendingSupplies(orders: SupplyOrder[]): PendingSupply[] {
  const out: PendingSupply[] = [];
  for (const order of orders) {
    if (!awaitingDelivery(order)) continue;
    for (const item of order.items) {
      if (item.check) continue; // เช็คแล้ว = ของมาแล้ว
      out.push({
        productId: item.productId,
        name: item.name,
        qty: item.qty,
        orderedDate: order.orderedDate,
        orderId: order.id,
        supplier: order.supplier
      });
    }
  }
  return out;
}

/**
 * ของในลิสต์ "ต้องสั่ง" ตัวนี้ สั่งไปแล้วหรือยัง — จับด้วย productId ก่อน ถ้าไม่มีใช้ชื่อ
 * (ตรงกันทั้งชื่อ หรือชื่อหนึ่งอยู่ในอีกชื่อ เมื่อยาวพอจะไม่ชนมั่ว).
 */
export function findPending(need: { productId?: string; name: string }, pending: PendingSupply[]): PendingSupply | undefined {
  if (need.productId) {
    const byId = pending.find((entry) => entry.productId && entry.productId === need.productId);
    if (byId) return byId;
  }
  const target = normaliseName(need.name);
  if (!target) return undefined;
  return pending.find((entry) => {
    const name = normaliseName(entry.name);
    if (!name) return false;
    if (name === target) return true;
    const [short, long] = name.length < target.length ? [name, target] : [target, name];
    return short.length >= 6 && long.includes(short);
  });
}

// ── แจ้งเตือนเจ้าของร้าน ───────────────────────────────────────────────────

function plain(text: string): string {
  return text.replace(/[[\]*_`]/g, " ").trim();
}

/** Telegram ตอนรับของแล้วมีของไม่ตรง — plain text (Vera ส่ง Markdown แล้ว fallback) */
export function mismatchAlertText(order: SupplyOrder, branchName: string): string {
  const lines = [`ของเติมสต็อกไม่ตรง - ${plain(order.supplier)} (${branchName})`, `สั่ง ${order.orderedDate}`];
  for (const item of problemItems(order)) lines.push(`- ${plain(item.name)}: ${plain(itemProblemText(item))}`);
  lines.push("", "ต้องติดต่อซัพ: https://sop.uplevelguild.com/supplies");
  return lines.join("\n");
}

// ── ตรวจ input ─────────────────────────────────────────────────────────────

const MAX_ITEMS = 150;
const MAX_PHOTOS = 10;

export function cleanText(value: unknown, max = 300): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function cleanNumber(value: unknown): number | undefined {
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/,/g, "")) : NaN;
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 100) / 100 : undefined;
}

export function isStorageUrl(value: unknown): value is string {
  return typeof value === "string" && /^https:\/\/firebasestorage\.googleapis\.com\//.test(value);
}

export function normalisePhotos(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter(isStorageUrl).slice(0, MAX_PHOTOS) : [];
}

export type SupplyItemInput = { id?: unknown; name?: unknown; qty?: unknown; unit?: unknown; productId?: unknown };

/** รายการที่คนสั่งกรอก/ตรวจจากที่ระบบอ่านรูป — คืน error ภาษาไทยให้โชว์ตรงๆ */
export function normaliseItems(raw: unknown, makeId: (index: number) => string): { items: SupplyItem[]; error?: string } {
  if (!Array.isArray(raw)) return { items: [], error: "ต้องมีรายการที่สั่งอย่างน้อย 1 รายการ" };
  const items: SupplyItem[] = [];
  for (const [index, entry] of raw.slice(0, MAX_ITEMS).entries()) {
    const input = (entry || {}) as SupplyItemInput;
    const name = cleanText(input.name, 160);
    if (!name) continue;
    const qty = Math.max(1, Math.min(9999, Math.round(Number(input.qty) || 1)));
    const item: SupplyItem = { id: makeId(index), name, qty };
    const unit = cleanText(input.unit, 20);
    if (unit) item.unit = unit;
    const productId = cleanText(input.productId, 60);
    if (productId) item.productId = productId;
    items.push(item);
  }
  if (!items.length) return { items: [], error: "ต้องมีรายการที่สั่งอย่างน้อย 1 รายการ" };
  return { items };
}

export function parseSupplyCheck(value: unknown): SupplyCheck | null {
  return value === "ok" || value === "short" || value === "over" || value === "wrong" || value === "damaged" || value === "missing"
    ? value
    : null;
}

export function parseNextStep(value: unknown): SupplyNextStep | null {
  return value === "resend" || value === "refund" || value === "return" || value === "accept" || value === "other" ? value : null;
}

// ── อ่านรูปรายการสั่ง (ผลจากโมเดล) ─────────────────────────────────────────

export type ReadOrderResult = {
  supplier?: string;
  orderedDate?: string;
  total?: number;
  items: Array<{ name: string; qty: number; unit?: string; productId?: string }>;
};

/** ดึง JSON ก้อนแรกจากข้อความที่โมเดลตอบ แล้วตรวจทุกช่อง (productId ต้องอยู่ในลิสต์ที่ส่งไป) */
export function parseReadOrder(text: string, knownProductIds: Set<string>): ReadOrderResult {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { items: [] };
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return { items: [] };
  }
  const items: ReadOrderResult["items"] = [];
  for (const raw of Array.isArray(data.items) ? data.items.slice(0, MAX_ITEMS) : []) {
    const entry = (raw || {}) as Record<string, unknown>;
    const name = cleanText(entry.name, 160);
    if (!name) continue;
    const qty = Math.max(1, Math.min(9999, Math.round(Number(entry.qty) || 1)));
    const item: ReadOrderResult["items"][number] = { name, qty };
    const unit = cleanText(entry.unit, 20);
    if (unit) item.unit = unit;
    const productId = cleanText(entry.productId, 60);
    if (productId && knownProductIds.has(productId)) item.productId = productId;
    items.push(item);
  }
  const result: ReadOrderResult = { items };
  const supplier = cleanText(data.supplier, 80);
  if (supplier) result.supplier = supplier;
  if (isIsoDate(data.orderedDate)) result.orderedDate = data.orderedDate;
  const total = cleanNumber(data.total);
  if (total) result.total = total;
  return result;
}
