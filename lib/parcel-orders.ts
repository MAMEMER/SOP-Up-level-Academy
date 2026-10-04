// พัสดุการ์ดที่สั่งซื้อ (สั่งจากพ่อค้าในเฟซ → ส่งมาที่ร้าน) — กติกาล้วน ไม่แตะ Firestore/DOM.
//
// Flow ที่แชมป์วางไว้:
//   1. เจ้าของร้านสั่งการ์ด → ลงออเดอร์ที่นี่ พร้อมรูปที่พ่อค้าส่งมา + บอกว่าแต่ละใบ
//      "เก็บไว้ก่อน (ยังไม่ขาย)" หรือ "ลงแฟ้มขาย ราคา X บาท" · ปลายทาง default บางแค
//   2. พัสดุมาถึงร้าน → แอดมินหน้าร้านถ่ายวิดีโอตอนแกะ อัปโหลด (= รับพัสดุ)
//   3. เทียบของกับออเดอร์ทีละรายการ: ตรง → เอาลงตามที่บอก แล้วกด "ลงแล้ว"
//                                      ไม่ตรง/ขาด → แจ้งปัญหา เจ้าของร้านไปตามพ่อค้า
//
// เดดไลน์สองฝั่ง (ห้ามหลุดเด็ดขาด):
//   - ฝั่งเจ้าของร้าน: สั่งแล้ว PARCEL_ARRIVAL_DAYS (5) วันยังไม่ถึงร้าน → เตือนแชมป์ไปตามพ่อค้า
//   - ฝั่งแอดมิน: ของถึงร้านแล้วต้องแกะ-เช็ค-ลงให้จบภายในวันที่ถึง + อีก PARCEL_PROCESS_GRACE_DAYS
//     วัน เลยจากนั้นหัก KPI หมวดงานที่มอบหมาย ทุกคนที่เข้ากะสาขานั้นจริงในวันที่เลย (งานหน้าร้าน
//     ใครอยู่ก็ต้องหยิบทำ — แบบเดียวกับงานกลุ่ม)

import type { ScoreAdjustment } from "./score-adjustments.ts";

export const PARCEL_COLLECTION = "sop_parcel_orders";

/** สั่งแล้วต้องได้ของภายในกี่วัน */
export const PARCEL_ARRIVAL_DAYS = 5;

/** ของถึงแล้ว ต้องลงให้จบภายใน "วันที่ถึง + กี่วัน" (1 = วันที่ถึงหรือวันถัดไป) */
export const PARCEL_PROCESS_GRACE_DAYS = 1;

/** ไม่หักย้อนหลังก่อนวันที่ระบบเปิดใช้ */
export const PARCEL_KPI_START = "2026-10-04";

export const DEFAULT_PARCEL_BRANCH = "bangkae";

export type ParcelPlan = "keep" | "sell";

export const PARCEL_PLAN_LABEL: Record<ParcelPlan, string> = {
  keep: "เก็บไว้ก่อน (ยังไม่ขาย)",
  sell: "ลงแฟ้มขาย"
};

/** ผลเช็คของรายการหนึ่ง: ตรง · ไม่ตรง (ได้ผิดใบ/สภาพไม่ตรง) · ไม่มีในกล่อง */
export type ParcelCheck = "ok" | "wrong" | "missing";

export type ParcelItem = {
  id: string;
  name: string;
  qty: number;
  plan: ParcelPlan;
  /** ราคาที่จะลงแฟ้มขาย (บาท) — ใช้เมื่อ plan = sell */
  price?: number;
  note?: string;
  check?: ParcelCheck;
  checkNote?: string;
  checkedBy?: string;
  checkedAt?: string;
  /** เอาลงตามที่บอกแล้ว (เก็บเข้าที่ / ลงแฟ้ม) */
  storedBy?: string;
  storedAt?: string;
};

export type ParcelProblem = {
  /** รายการการ์ดที่มีปัญหา (ว่าง = ปัญหาทั้งกล่อง เช่น กล่องบุบ) */
  itemId?: string;
  note: string;
  by: string;
  at: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolution?: string;
};

export type ParcelOrder = {
  id: string;
  /** สาขาปลายทางที่ของจะไปลง */
  branch: string;
  seller: string;
  sellerLink?: string;
  /** วันที่สั่ง/จ่ายเงิน (YYYY-MM-DD เวลาไทย) */
  orderedDate: string;
  /** ต้องถึงร้านภายใน = orderedDate + PARCEL_ARRIVAL_DAYS */
  dueDate: string;
  totalPaid?: number;
  trackingNumber?: string;
  note?: string;
  /** รูปที่พ่อค้าส่งมาว่าซื้อการ์ดไหน */
  sellerPhotos: string[];
  items: ParcelItem[];
  createdBy: string;
  createdAt: string;
  /** วันที่ของถึงร้าน (YYYY-MM-DD) — เริ่มนับเดดไลน์ฝั่งแอดมินจากวันนี้ */
  arrivedDate?: string;
  arrivedAt?: string;
  arrivedBy?: string;
  /** วิดีโอตอนแกะกล่อง */
  unboxVideoUrl?: string;
  problems?: ParcelProblem[];
  /** แอดมินทำส่วนของตัวเองครบ (ทุกรายการ ลงแล้ว หรือ แจ้งปัญหาแล้ว) */
  processedAt?: string;
  processedDate?: string;
  cancelled?: boolean;
  cancelledBy?: string;
  cancelledAt?: string;
  /** วันล่าสุดที่ส่ง Telegram เตือนเจ้าของร้านเรื่องออเดอร์นี้ (กันเตือนซ้ำในวันเดียว) */
  ownerAlertedOn?: string;
};

/**
 * สถานะที่หน้าจอใช้:
 *  waiting   = รอของมา (ยังไม่เลย 5 วัน)
 *  overdue   = เลย 5 วันแล้วยังไม่ถึง → เจ้าของร้านต้องตามพ่อค้า
 *  arrived   = ถึงแล้ว แอดมินกำลังเช็ค/ลง (ยังอยู่ในกำหนด)
 *  late      = ถึงแล้วแต่แอดมินยังทำไม่จบ เลยกำหนด → หัก KPI
 *  problem   = แอดมินทำครบแล้ว แต่มีรายการไม่ตรง/ขาด รอเจ้าของร้านจัดการ
 *  done      = จบ
 *  cancelled = ยกเลิก
 */
export type ParcelState = "waiting" | "overdue" | "arrived" | "late" | "problem" | "done" | "cancelled";

export const PARCEL_STATE_LABEL: Record<ParcelState, string> = {
  waiting: "รอของมา",
  overdue: "เกิน 5 วัน ยังไม่ถึง",
  arrived: "ถึงแล้ว รอเช็ค/ลง",
  late: "ถึงแล้ว ยังไม่ลง เลยกำหนด",
  problem: "ของไม่ตรง รอเจ้าของร้าน",
  done: "เรียบร้อย",
  cancelled: "ยกเลิก"
};

// ── วันที่ ─────────────────────────────────────────────────────────────────

/** วันธุรกิจ (Bangkok) — en-CA ให้ YYYY-MM-DD */
export function bangkokDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function addDays(workDate: string, days: number): string {
  const anchor = new Date(`${workDate}T12:00:00+07:00`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return bangkokDate(anchor);
}

/** b − a เป็นจำนวนวัน */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00+07:00`) - Date.parse(`${a}T12:00:00+07:00`)) / 86_400_000);
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function arrivalDueDate(orderedDate: string): string {
  return addDays(orderedDate, PARCEL_ARRIVAL_DAYS);
}

/** วันสุดท้ายที่แอดมินต้องลงให้จบ */
export function processDueDate(arrivedDate: string): string {
  return addDays(arrivedDate, PARCEL_PROCESS_GRACE_DAYS);
}

// ── สถานะ ──────────────────────────────────────────────────────────────────

/** รายการนี้แอดมินทำส่วนของตัวเองจบแล้ว: ตรงแล้วลงแล้ว หรือ ไม่ตรง/ขาดแล้วแจ้งไว้ */
export function itemHandled(item: ParcelItem): boolean {
  if (!item.check) return false;
  if (item.check === "ok") return Boolean(item.storedAt);
  return true;
}

export function openProblems(order: Pick<ParcelOrder, "problems">): ParcelProblem[] {
  return (order.problems || []).filter((problem) => !problem.resolvedAt);
}

export function allItemsHandled(order: Pick<ParcelOrder, "items">): boolean {
  return order.items.length > 0 && order.items.every(itemHandled);
}

export function parcelState(order: ParcelOrder, today: string): ParcelState {
  if (order.cancelled) return "cancelled";
  if (!order.arrivedDate) return today > order.dueDate ? "overdue" : "waiting";
  if (!order.processedDate) return today > processDueDate(order.arrivedDate) ? "late" : "arrived";
  return openProblems(order).length ? "problem" : "done";
}

/** ยังต้องมีคนทำอะไรอยู่ไหม (ใช้กรองหน้าแรก) */
export function parcelIsOpen(order: ParcelOrder, today: string): boolean {
  const state = parcelState(order, today);
  return state !== "done" && state !== "cancelled";
}

/** เกินกำหนดถึงร้านมากี่วันแล้ว (0 = ยังไม่เกิน) */
export function daysOverdue(order: ParcelOrder, today: string): number {
  if (order.arrivedDate || order.cancelled) return 0;
  return Math.max(0, daysBetween(order.dueDate, today));
}

const STATE_ORDER: Record<ParcelState, number> = {
  late: 0,
  arrived: 1,
  overdue: 2,
  problem: 3,
  waiting: 4,
  done: 5,
  cancelled: 6
};

/** งานที่แอดมินต้องทำ (ของถึงแล้ว) ขึ้นก่อน แล้วค่อยเรื่องที่เจ้าของร้านต้องตาม */
export function sortParcels(orders: ParcelOrder[], today: string): ParcelOrder[] {
  return [...orders].sort((left, right) => {
    const byState = STATE_ORDER[parcelState(left, today)] - STATE_ORDER[parcelState(right, today)];
    if (byState !== 0) return byState;
    return (left.arrivedDate || left.dueDate).localeCompare(right.arrivedDate || right.dueDate);
  });
}

export function itemDestination(item: Pick<ParcelItem, "plan" | "price">): string {
  if (item.plan === "sell") {
    return item.price ? `ลงแฟ้มขาย ${item.price.toLocaleString("th-TH")} บาท` : "ลงแฟ้มขาย (ยังไม่ระบุราคา)";
  }
  return PARCEL_PLAN_LABEL.keep;
}

export function parcelStatusText(order: ParcelOrder, today: string): string {
  const state = parcelState(order, today);
  if (state === "waiting") {
    const left = daysBetween(today, order.dueDate);
    return left <= 0 ? "ต้องถึงร้านวันนี้" : `ต้องถึงร้านภายใน ${left} วัน (${order.dueDate})`;
  }
  if (state === "overdue") return `เกินกำหนด ${daysOverdue(order, today)} วัน — ยังไม่ถึงร้าน`;
  if (state === "arrived" && order.arrivedDate) {
    const due = processDueDate(order.arrivedDate);
    return due === today ? "ถึงแล้ว — ต้องลงให้จบวันนี้" : `ถึงแล้ว — ลงให้จบภายใน ${due}`;
  }
  if (state === "late" && order.arrivedDate) {
    return `ถึงตั้งแต่ ${order.arrivedDate} ยังลงไม่จบ — เลยกำหนด ${daysBetween(processDueDate(order.arrivedDate), today)} วัน`;
  }
  return PARCEL_STATE_LABEL[state];
}

// ── KPI ────────────────────────────────────────────────────────────────────

export type ParcelKpiOptions = {
  /** วันนี้ (เวลาไทย) — วันนี้ยังไม่จบ นับได้ถึงเมื่อวาน */
  today: string;
  /** หักกี่คะแนนต่อคนต่อวันที่เลย (0 = ปิด) */
  ratePerDay: number;
  startFrom?: string;
  /**
   * คนที่ "เข้ากะจริง" สาขาไหนวันไหน — key `${staffCode}:${workDate}:${branch}` (กะ ∩ ตอกบัตร).
   * ไม่มีในเซ็ต = วันนั้นไม่ได้อยู่ร้านนั้น ไม่โดนหัก.
   */
  workedAtBranch: Set<string>;
};

/**
 * ของถึงร้านแล้วแต่แอดมินยังลงไม่จบหลังกำหนด → หักทุกคนที่เข้ากะสาขาปลายทางในวันที่เลย.
 * วันที่นับ = [processDue+1 … min(วันที่ทำจบ−1, เมื่อวาน)] — วันที่ทำจบไม่นับว่าเลย.
 * ยกเลิกแล้วไม่คิด.
 */
export function parcelLateAdjustments(orders: ParcelOrder[], opts: ParcelKpiOptions): ScoreAdjustment[] {
  const rate = Math.abs(Math.round(opts.ratePerDay));
  if (rate === 0) return [];
  const startFrom = opts.startFrom ?? PARCEL_KPI_START;
  const yesterday = addDays(opts.today, -1);
  const out: ScoreAdjustment[] = [];

  for (const order of orders) {
    if (order.cancelled || !order.arrivedDate) continue;
    let first = addDays(processDueDate(order.arrivedDate), 1);
    if (first < startFrom) first = startFrom;
    let last = yesterday;
    if (order.processedDate) {
      const beforeDone = addDays(order.processedDate, -1);
      if (beforeDone < last) last = beforeDone;
    }
    const span = Math.min(daysBetween(first, last), 120);
    if (span < 0) continue;
    const label = order.seller || "ไม่ระบุร้าน";

    for (let offset = 0; offset <= span; offset += 1) {
      const date = addDays(first, offset);
      for (const key of opts.workedAtBranch) {
        const [staffCode, workDate, branch] = key.split(":");
        if (workDate !== date || branch !== order.branch || !staffCode) continue;
        out.push({
          id: `parcel-${order.id}-${staffCode}-${date}`.replace(/[^a-zA-Z0-9-]/g, "-"),
          workDate: date,
          employeeName: staffCode,
          category: "assigned_work",
          points: -rate,
          reason: `พัสดุการ์ด (${label}) ถึงร้าน ${order.arrivedDate} แต่ยังไม่แกะ-เช็ค-ลงให้จบ`,
          recordedAt: `${date}T23:59:59.000+07:00`,
          recordedBy: "auto"
        });
      }
    }
  }
  return out;
}

// ── แจ้งเตือนเจ้าของร้าน ───────────────────────────────────────────────────

export type ParcelCounts = {
  /** เกิน 5 วันยังไม่ถึงร้าน */
  overdue: number;
  /** ถึงแล้วแอดมินยังไม่ลง เลยกำหนด */
  late: number;
  /** ถึงแล้ว รอแอดมินลง (ยังในกำหนด) */
  arrived: number;
  /** ของไม่ตรง/ขาด รอเจ้าของร้าน */
  problem: number;
  waiting: number;
};

export function parcelCounts(orders: ParcelOrder[], today: string): ParcelCounts {
  const counts: ParcelCounts = { overdue: 0, late: 0, arrived: 0, problem: 0, waiting: 0 };
  for (const order of orders) {
    const state = parcelState(order, today);
    if (state in counts) counts[state as keyof ParcelCounts] += 1;
  }
  return counts;
}

/** ออเดอร์ที่ต้องเตือนแชมป์ทาง Telegram วันนี้ (ยังไม่ได้เตือนวันนี้) */
export function parcelsNeedingOwnerAlert(orders: ParcelOrder[], today: string): ParcelOrder[] {
  return orders.filter((order) => {
    if (order.ownerAlertedOn === today) return false;
    const state = parcelState(order, today);
    return state === "overdue" || state === "late" || state === "problem";
  });
}

/** ข้อความ Telegram — plain text ล้วน (Vera ส่งแบบ Markdown แล้ว fallback; เลี่ยง [ ] * _) */
export function ownerAlertMessage(orders: ParcelOrder[], today: string): string {
  const lines: string[] = ["พัสดุการ์ด - ต้องตาม"];
  const groups: Array<{ state: ParcelState; head: string }> = [
    { state: "overdue", head: "เกิน 5 วันยังไม่ถึงร้าน (ตามพ่อค้า)" },
    { state: "late", head: "ของถึงแล้ว แอดมินยังไม่ลง" },
    { state: "problem", head: "ของไม่ตรง/ขาด" }
  ];
  for (const group of groups) {
    const list = orders.filter((order) => parcelState(order, today) === group.state);
    if (!list.length) continue;
    lines.push("", `${group.head}: ${list.length}`);
    for (const order of list) {
      const detail =
        group.state === "overdue"
          ? `สั่ง ${order.orderedDate} เกิน ${daysOverdue(order, today)} วัน`
          : group.state === "late"
            ? `ถึง ${order.arrivedDate}`
            : openProblems(order).map((problem) => problem.note).join(" / ");
      lines.push(`- ${plain(order.seller || "ไม่ระบุร้าน")} · ${detail}`);
    }
  }
  lines.push("", "https://sop.uplevelguild.com/parcels");
  return lines.join("\n");
}

function plain(text: string): string {
  return text.replace(/[[\]*_`]/g, " ").trim();
}

// ── สร้าง/ตรวจ input ───────────────────────────────────────────────────────

export type ParcelItemInput = { name?: unknown; qty?: unknown; plan?: unknown; price?: unknown; note?: unknown };

const MAX_ITEMS = 200;
const MAX_PHOTOS = 20;

function cleanText(value: unknown, max = 300): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanNumber(value: unknown): number | undefined {
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/,/g, "")) : NaN;
  return Number.isFinite(num) && num > 0 ? Math.round(num * 100) / 100 : undefined;
}

export function isStorageUrl(value: unknown): value is string {
  return typeof value === "string" && /^https:\/\/firebasestorage\.googleapis\.com\//.test(value);
}

/** ตรวจรายการการ์ดที่เจ้าของร้านกรอก — คืน error เป็นภาษาไทยให้โชว์ตรงๆ */
export function normaliseItems(raw: unknown, makeId: (index: number) => string): { items: ParcelItem[]; error?: string } {
  if (!Array.isArray(raw)) return { items: [], error: "ต้องมีรายการการ์ดอย่างน้อย 1 รายการ" };
  const items: ParcelItem[] = [];
  for (const [index, entry] of raw.slice(0, MAX_ITEMS).entries()) {
    const input = (entry || {}) as ParcelItemInput;
    const name = cleanText(input.name, 200);
    if (!name) continue;
    const plan: ParcelPlan = input.plan === "sell" ? "sell" : "keep";
    const qty = Math.max(1, Math.min(999, Math.round(Number(input.qty) || 1)));
    const price = plan === "sell" ? cleanNumber(input.price) : undefined;
    if (plan === "sell" && !price) return { items: [], error: `"${name}" จะลงแฟ้มขาย ต้องใส่ราคา` };
    const item: ParcelItem = { id: makeId(index), name, qty, plan };
    if (price) item.price = price;
    const note = cleanText(input.note, 300);
    if (note) item.note = note;
    items.push(item);
  }
  if (!items.length) return { items: [], error: "ต้องมีรายการการ์ดอย่างน้อย 1 รายการ" };
  return { items };
}

export function normalisePhotos(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter(isStorageUrl).slice(0, MAX_PHOTOS) : [];
}

export { cleanText as cleanParcelText, cleanNumber as cleanParcelNumber };
