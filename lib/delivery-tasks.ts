// งานส่งของจากออเดอร์เว็บกิลด์ — routing rules.
//
// ลูกค้าสั่งของบน uplevelguild.com แล้วจ่ายเงิน → ออเดอร์ต้องถูกแพ็คและส่งภายใน 1 วัน.
// เดิมทีมหน้าร้านต้องไปเปิดหน้า admin ของเว็บกิลด์เอง งานเลยตกหล่น. โมดูลนี้ตัดสินว่า
// ออเดอร์ที่จ่ายแล้วควร "เด้ง" ขึ้นหน้า Dashboard ของกะไหน:
//
//   จ่ายก่อน 15:00  → เป็นงานของทีมวันนี้ (ขึ้นทั้งสองกะ — สองกะอยู่ร้านคาบกันอยู่แล้ว)
//   จ่ายตั้งแต่ 15:00 → ขึ้นให้ทีมพรุ่งนี้ด้วย (วันนี้อาจส่งไม่ทันรอบรถ)
//   วันนี้ส่งไม่ทัน    → กดปุ่ม "ส่งงานให้พรุ่งนี้" ย้ายทั้งใบไปให้ทีมที่มาวันถัดไป
//
// pure (ไม่แตะ Firestore / DOM) เพื่อให้ unit-test ได้ — ตัวอ่าน/เขียนอยู่ที่
// lib/delivery-tasks-server.ts.

import { defaultShiftStart, shiftEndTime, type ShiftCode } from "./shift-schedule.ts";

/** เวลาตัดรอบ: ออเดอร์ที่จ่ายตั้งแต่เวลานี้ไปถือว่ากะปัจจุบันอาจส่งไม่ทัน */
export const DELIVERY_CUTOFF = "15:00";

/** ต้องส่งภายใน 1 วันนับจากวันที่จ่ายเงิน */
export const DELIVERY_DUE_DAYS = 1;

export type DeliveryStatus = "open" | "packing" | "shipped";

/** ช่วงเวลาทำงานจริงของกะหนึ่งในวันหนึ่ง (รวมทุกคนที่ลงกะนั้น) */
export type ShiftWindow = {
  workDate: string;
  shift: ShiftCode;
  /** "HH:MM" — เวลาเข้างานที่เร็วที่สุดของกะนั้น */
  start: string;
  /** "HH:MM" — เวลาเลิกงานที่ช้าที่สุดของกะนั้น */
  end: string;
  staffCodes: string[];
};

export type ShiftWindows = {
  today: ShiftWindow[];
  tomorrow: ShiftWindow[];
};

/** หนึ่งใบงานส่งของ = หนึ่งออเดอร์ที่จ่ายเงินแล้ว (Firestore: delivery_tasks) */
export type DeliveryTask = {
  id: string;
  branch: string;
  /** doc id ของ shop-orders บนเว็บกิลด์ */
  orderId: string;
  /** เลขอ้างอิงสั้นให้พนักงานเทียบกับหน้า admin ของเว็บกิลด์ */
  orderCode: string;
  source: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  /** หมายเหตุที่ลูกค้าฝากไว้ตอนสั่ง เช่น "โทรก่อน" — คนแพ็คต้องเห็น */
  customerNote: string;
  itemsSummary: string;
  /** จำนวนชิ้นที่ต้องหยิบใส่กล่องจริง (รวมของแถมแล้ว) ไม่ใช่จำนวนที่สั่ง */
  itemCount: number;
  total: number;
  /** ISO เวลาที่ยืนยันว่าจ่ายแล้ว */
  paidAt: string;
  /** วันธุรกิจ (Bangkok) ที่จ่ายเงิน */
  paidWorkDate: string;
  /** กำหนดส่ง = paidWorkDate + DELIVERY_DUE_DAYS */
  dueDate: string;
  detectedAt: string;
  /** กะที่เห็นงานนี้ รูปแบบ "YYYY-MM-DD:s1" */
  targets: string[];
  status: DeliveryStatus;
  claimedBy?: string;
  claimedAt?: string;
  handedOff?: boolean;
  handedOffBy?: string;
  handedOffAt?: string;
  trackingNumber?: string;
  shippedBy?: string;
  shippedAt?: string;
};

export type DeliveryTaskState = "overdue" | "due" | "upcoming" | "done";

/** "YYYY-MM-DD:s1" — คีย์ที่ใช้บอกว่างานนี้เป็นของกะไหน วันไหน */
export function shiftTargetKey(workDate: string, shift: ShiftCode): string {
  return `${workDate}:${shift}`;
}

export function parseShiftTarget(key: string): { workDate: string; shift: ShiftCode } | null {
  const [workDate, shift] = key.split(":");
  if (!workDate || (shift !== "s1" && shift !== "s2")) return null;
  return { workDate, shift };
}

/** "HH:MM" → นาทีนับจากเที่ยงคืน. คืน null เมื่อรูปแบบไม่ถูก */
export function minutesOfDay(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** วันธุรกิจ (Bangkok) ของเวลาหนึ่ง — en-CA ให้ YYYY-MM-DD */
export function bangkokWorkDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

/** นาทีของวันตามเวลาไทย — ใช้ตัดสินว่าอยู่ในกะไหนและก่อน/หลัง 15:00 */
export function bangkokMinutesOfDay(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value || "0");
  return hour * 60 + minute;
}

/** บวกวันบนปฏิทิน — ยึดเที่ยงวันไทยกันวันเลื่อนตอนแปลงโซนเวลา */
export function addWorkDays(workDate: string, days: number): string {
  const anchor = new Date(`${workDate}T12:00:00+07:00`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return bangkokWorkDate(anchor);
}

type ShiftCell = { staffCode: string; shift: ShiftCode; startTime?: string };

/**
 * รวม plan cell ของวันหนึ่งเป็นช่วงเวลาต่อกะ. start = คนที่เข้าเร็วสุด, end = คนที่เลิกช้าสุด
 * เพื่อให้ "กะนี้ยังอยู่ร้านไหม" ครอบคลุมทุกคนในกะ. กะที่ไม่มีใครลงจะไม่ถูกสร้าง.
 */
export function buildShiftWindows(workDate: string, cells: ShiftCell[]): ShiftWindow[] {
  const byShift = new Map<ShiftCode, ShiftCell[]>();
  for (const cell of cells) {
    const list = byShift.get(cell.shift);
    if (list) list.push(cell);
    else byShift.set(cell.shift, [cell]);
  }

  const windows: ShiftWindow[] = [];
  for (const shift of ["s1", "s2"] as ShiftCode[]) {
    const list = byShift.get(shift);
    if (!list?.length) continue;
    let earliest = Number.POSITIVE_INFINITY;
    let latest = Number.NEGATIVE_INFINITY;
    for (const cell of list) {
      const start = (cell.startTime && minutesOfDay(cell.startTime) !== null ? cell.startTime : null) ?? defaultShiftStart(shift);
      const startMin = minutesOfDay(start) ?? 0;
      const endMin = minutesOfDay(shiftEndTime(start)) ?? startMin;
      // กะไม่เคยข้ามเที่ยงคืน (s2 เข้าช้าสุด 13:00 + 9 ชม. = 22:00) แต่กันไว้ให้ end > start เสมอ
      if (startMin < earliest) earliest = startMin;
      if (Math.max(endMin, startMin) > latest) latest = Math.max(endMin, startMin);
    }
    windows.push({
      workDate,
      shift,
      start: formatMinutes(earliest),
      end: formatMinutes(latest),
      staffCodes: list.map((cell) => cell.staffCode)
    });
  }
  return windows.sort((left, right) => (minutesOfDay(left.start) ?? 0) - (minutesOfDay(right.start) ?? 0));
}

function formatMinutes(total: number): string {
  const safe = Number.isFinite(total) ? Math.max(0, Math.min(total, 24 * 60)) : 0;
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

/** ยังมีกะของวันนั้นที่ยังไม่เลิกงาน ณ เวลานี้หรือเปล่า */
function stillOnDuty(now: Date, windows: ShiftWindow[]): boolean {
  const nowMinutes = bangkokMinutesOfDay(now);
  return windows.some((window) => nowMinutes < (minutesOfDay(window.end) ?? 0));
}

function targetKeysFor(windows: ShiftWindow[]): string[] {
  return windows.map((window) => shiftTargetKey(window.workDate, window.shift));
}

/**
 * กะของวันถัดไป — ปลายทางของปุ่ม "ส่งงานให้พรุ่งนี้".
 * ถ้ายังไม่ได้ลงตารางกะพรุ่งนี้ ก็ยิงไปที่ทั้งสองกะของวันนั้นไว้ก่อน พอลงตารางแล้วคนที่เข้า
 * กะจะเห็นเอง — ดีกว่าปฏิเสธแล้วงานค้างอยู่กับกะที่ส่งไม่ทัน
 */
export function nextDayTargetsFor(windows: ShiftWindows, tomorrowDate: string): string[] {
  const keys = targetKeysFor(windows.tomorrow);
  return keys.length ? keys : [shiftTargetKey(tomorrowDate, "s1"), shiftTargetKey(tomorrowDate, "s2")];
}

/**
 * กะที่ต้องเห็นออเดอร์ใบนี้ ตามเวลาที่จ่ายเงิน.
 *
 * สองกะเข้างานเวลาใกล้กันและอยู่ร้านคาบกันเกือบทั้งวัน การแยกว่าใบไหนของกะไหนภายในวัน
 * เดียวกันจึงไม่มีประโยชน์ — ออเดอร์ขึ้นทั้งสองกะของวันนั้นเลย. ตัวที่มีความหมายจริงคือ
 * "วันนี้" กับ "พรุ่งนี้":
 *   ก่อน 15:00        → ทีมวันนี้
 *   ตั้งแต่ 15:00      → ทีมวันนี้ + ทีมพรุ่งนี้ (วันนี้อาจส่งไม่ทันรอบรถ)
 *   ร้านปิดไปแล้ว      → ทีมพรุ่งนี้
 */
export function deliveryTargetsFor(now: Date, windows: ShiftWindows): string[] {
  const cutoff = minutesOfDay(DELIVERY_CUTOFF) ?? 15 * 60;
  const afterCutoff = bangkokMinutesOfDay(now) >= cutoff;
  const today = targetKeysFor(windows.today);
  const tomorrow = targetKeysFor(windows.tomorrow);

  if (!stillOnDuty(now, windows.today)) return [...new Set(tomorrow)];
  return [...new Set(afterCutoff ? [...today, ...tomorrow] : today)];
}

export type DeliveryViewer = {
  isAdmin: boolean;
  staffCode: string | null;
  /** กะที่พนักงานคนนี้ลงไว้วันนี้ (null = วันหยุด/ไม่มีกะ) */
  shiftToday: ShiftCode | null;
  today: string;
};

/**
 * ใครเห็นงานใบนี้: เจ้าของร้านเห็นหมด · พนักงานเห็นเมื่อกะตัวเองวันนี้ถูก target,
 * เมื่อรับงานไว้เอง, หรือเมื่องานยังไม่ส่งแต่เลยวันที่ target ไปแล้ว (งานตกค้าง —
 * ต้องมีคนเห็น ไม่งั้นออเดอร์หายไปเงียบ ๆ).
 */
export function deliveryTaskVisibleTo(task: DeliveryTask, viewer: DeliveryViewer): boolean {
  if (viewer.isAdmin) return true;
  if (!viewer.staffCode) return false;
  if (task.claimedBy === viewer.staffCode) return true;
  // ส่งไปแล้วไม่ต้องกลับมารกหน้าคนอื่น (ต้องเช็คก่อนกฎงานตกค้างด้านล่าง)
  if (task.status === "shipped") return false;
  if (isOwnShiftTask(task, viewer)) return true;
  // ไม่มีกะไหนถูกกำหนดเลย (วันนั้นยังไม่ได้ลงตารางกะ) → ห้ามให้ออเดอร์หายไปจากสายตาทุกคน
  if (!task.targets.length) return true;
  // อยู่ร้านวันนี้ = เห็นออเดอร์ที่ยังไม่ได้ส่งทุกใบ ถึงจะไม่ใช่ของกะตัวเอง.
  // กติกา 15:00 บอกว่าใบไหน "เป็นงานของกะไหน" ไม่ใช่ว่าใครห้ามเห็น — คนที่ยืนอยู่หน้าร้าน
  // ต้องหยิบงานแทนกันได้ ไม่งั้นออเดอร์ที่กะเช้าทำไม่ทันจะหายไปจากสายตากะบ่ายทั้งใบ
  return Boolean(viewer.shiftToday);
}

/** ใบนี้เป็นงานของกะที่คนดูเข้าวันนี้หรือเปล่า — ใช้จัดลำดับและติดป้าย ไม่ใช่ตัวกันการมองเห็น */
export function isOwnShiftTask(task: DeliveryTask, viewer: DeliveryViewer): boolean {
  if (!viewer.shiftToday) return false;
  if (task.targets.includes(shiftTargetKey(viewer.today, viewer.shiftToday))) return true;
  // ไม่มีกะไหนถูก target (ยังไม่ได้ลงตารางวันนั้น) หรือเลยวันที่กำหนดไว้แล้ว → ตกเป็นของคนที่อยู่วันนี้
  if (!task.targets.length) return true;
  return task.targets.every((key) => (parseShiftTarget(key)?.workDate ?? "") < viewer.today);
}

export function deliveryTaskState(task: DeliveryTask, today: string): DeliveryTaskState {
  if (task.status === "shipped") return "done";
  if (today > task.dueDate) return "overdue";
  if (task.targets.some((key) => parseShiftTarget(key)?.workDate === today)) return "due";
  return "upcoming";
}

export function deliveryStatusText(task: DeliveryTask, today: string): string {
  if (task.status === "shipped") {
    return task.trackingNumber ? `ส่งแล้ว · ${task.trackingNumber}` : "ส่งแล้ว";
  }
  const late = today > task.dueDate;
  const prefix = late ? "เลยกำหนดส่ง" : `ส่งภายใน ${task.dueDate}`;
  if (task.status === "packing") return `${prefix} · กำลังแพ็ค`;
  return task.handedOff ? `${prefix} · รับต่อจากเมื่อวาน` : prefix;
}

/** ป้ายบอกว่าใบนี้เป็นของกะไหนบ้าง เช่น "10 ส.ค. กะ 2 · 11 ส.ค. กะ 1" */
export function deliveryTargetLabel(task: DeliveryTask): string {
  return task.targets
    .map((key) => parseShiftTarget(key))
    .filter((target): target is { workDate: string; shift: ShiftCode } => target !== null)
    .map((target) => `${target.workDate} ${target.shift === "s1" ? "กะ 1" : "กะ 2"}`)
    .join(" · ");
}

/** รายการสินค้าหนึ่งบรรทัดในออเดอร์เว็บกิลด์ */
export type OrderLine = {
  sku?: string;
  name?: string;
  /** จำนวนที่ลูกค้ากดสั่ง */
  qty?: number;
  /** จำนวนชิ้นจริงรวมของแถม (ออเดอร์ shield แถม 1 ทุก 10) */
  pieces?: number;
};

export function orderLineLabel(item: OrderLine): string {
  const name = item.name || item.sku || "สินค้า";
  const qty = Number(item.qty) || 0;
  // ชื่อสินค้าบางรายการใส่จำนวนมาในชื่อแล้ว (เช่น "Up Level Shield ×10 (+1 ฟรี = 11 ชิ้น)")
  // ต่อท้ายซ้ำจะกลายเป็น "×10 … ×10" อ่านแล้วสับสนตอนแพ็ค
  return qty > 1 && !name.includes(`×${qty}`) ? `${name} ×${qty}` : name;
}

/**
 * สรุปของที่ต้องแพ็ค. จำนวนนับจาก `pieces` ก่อนเสมอ — คนแพ็คต้องหยิบตามจำนวนชิ้นจริง
 * (รวมของแถม) ไม่ใช่จำนวนที่ลูกค้ากดสั่ง.
 */
export function summariseOrderLines(
  lines: OrderLine[],
  fallback?: { product?: string; pieces?: number }
): { summary: string; count: number } {
  if (!lines.length) {
    const pieces = Number(fallback?.pieces) || 0;
    return fallback?.product ? { summary: fallback.product, count: pieces } : { summary: "", count: 0 };
  }
  const count = lines.reduce((total, line) => total + (Number(line.pieces) || Number(line.qty) || 0), 0);
  const summary = lines.slice(0, 4).map(orderLineLabel).join(", ");
  return { summary: lines.length > 4 ? `${summary} …อีก ${lines.length - 4} รายการ` : summary, count };
}

/** เรียงงานที่ต้องส่ง: เลยกำหนดก่อน แล้วค่อยตามกำหนดส่ง */
export function sortDeliveryTasks(tasks: DeliveryTask[], today: string): DeliveryTask[] {
  const order: Record<DeliveryTaskState, number> = { overdue: 0, due: 1, upcoming: 2, done: 3 };
  return [...tasks].sort((left, right) => {
    const byState = order[deliveryTaskState(left, today)] - order[deliveryTaskState(right, today)];
    if (byState !== 0) return byState;
    if (left.dueDate !== right.dueDate) return left.dueDate.localeCompare(right.dueDate);
    return left.paidAt.localeCompare(right.paidAt);
  });
}
