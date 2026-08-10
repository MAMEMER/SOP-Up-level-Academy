// งานส่งของจากออเดอร์เว็บกิลด์ — routing rules.
//
// ลูกค้าสั่งของบน uplevelguild.com แล้วจ่ายเงิน → ออเดอร์ต้องถูกแพ็คและส่งภายใน 1 วัน.
// เดิมทีมหน้าร้านต้องไปเปิดหน้า admin ของเว็บกิลด์เอง งานเลยตกหล่น. โมดูลนี้ตัดสินว่า
// ออเดอร์ที่จ่ายแล้วควร "เด้ง" ขึ้นหน้า Dashboard ของกะไหน:
//
//   จ่ายก่อน 15:00  → ขึ้นเฉพาะ "กะปัจจุบัน" (กะที่กำลังทำงานอยู่ ยังมีเวลาส่งวันนี้)
//   จ่ายตั้งแต่ 15:00 → ขึ้นทั้ง "กะปัจจุบัน" และ "กะถัดไป" (กะปัจจุบันอาจส่งไม่ทันรอบรถ)
//   กะปัจจุบันส่งไม่ทัน  → กดปุ่ม "ส่งงานให้กะถัดไป" ย้ายงานไปกะถัดไปทั้งใบ
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
  itemsSummary: string;
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

/**
 * กะปัจจุบัน = ทุกกะที่ช่วงเวลาครอบ `now` (บางช่วงกะเปิดร้านกับกะปิดร้านอยู่พร้อมกัน).
 * กะถัดไป = กะแรกของวันนี้ที่ยังไม่เข้า ถ้าหมดวันแล้วก็เป็นกะแรกของพรุ่งนี้.
 */
export function resolveShiftRouting(
  now: Date,
  windows: ShiftWindows
): { current: ShiftWindow[]; next: ShiftWindow | null } {
  const nowMinutes = bangkokMinutesOfDay(now);
  const current = windows.today.filter((window) => {
    const start = minutesOfDay(window.start);
    const end = minutesOfDay(window.end);
    if (start === null || end === null) return false;
    return nowMinutes >= start && nowMinutes < end;
  });
  const laterToday = windows.today
    .filter((window) => (minutesOfDay(window.start) ?? 0) > nowMinutes)
    .sort((left, right) => (minutesOfDay(left.start) ?? 0) - (minutesOfDay(right.start) ?? 0));
  const next =
    laterToday[0] ??
    [...windows.tomorrow].sort((left, right) => (minutesOfDay(left.start) ?? 0) - (minutesOfDay(right.start) ?? 0))[0] ??
    null;
  return { current, next };
}

/**
 * กะที่ต้องเห็นออเดอร์ใบนี้ ตามเวลาที่จ่ายเงิน.
 * ก่อน 15:00 → กะปัจจุบัน · ตั้งแต่ 15:00 → กะปัจจุบัน + กะถัดไป.
 * ถ้าจ่ายนอกเวลาทำการ (ดึก/ก่อนร้านเปิด) จะตกไปที่กะที่เข้างานเป็นกะแรกถัดจากนั้น.
 */
export function deliveryTargetsFor(now: Date, windows: ShiftWindows): string[] {
  const { current, next } = resolveShiftRouting(now, windows);
  const cutoff = minutesOfDay(DELIVERY_CUTOFF) ?? 15 * 60;
  const afterCutoff = bangkokMinutesOfDay(now) >= cutoff;

  const picked = [...current];
  if (afterCutoff && next) picked.push(next);
  if (!picked.length && next) picked.push(next);

  const keys = picked.map((window) => shiftTargetKey(window.workDate, window.shift));
  return [...new Set(keys)];
}

/** คีย์กะถัดไป ณ เวลานี้ — ใช้ตอนกดปุ่ม "ส่งงานให้กะถัดไป" */
export function nextShiftTargetFor(now: Date, windows: ShiftWindows): string | null {
  const { next } = resolveShiftRouting(now, windows);
  return next ? shiftTargetKey(next.workDate, next.shift) : null;
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
  if (viewer.shiftToday && task.targets.includes(shiftTargetKey(viewer.today, viewer.shiftToday))) return true;
  if (task.status === "shipped") return false;
  // ยังไม่ได้ลงตารางกะวันที่ลูกค้าจ่ายเงิน → ไม่มีกะไหนถูก target. ห้ามให้ออเดอร์หายไป
  // จากสายตาทุกคน ให้ staff ที่ล็อกอินเห็นไว้ก่อน
  if (!task.targets.length) return true;
  const stale = task.targets.every((key) => (parseShiftTarget(key)?.workDate ?? "") < viewer.today);
  return stale && Boolean(viewer.shiftToday);
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
  return task.handedOff ? `${prefix} · รับต่อจากกะก่อน` : prefix;
}

/** ป้ายบอกว่าใบนี้เป็นของกะไหนบ้าง เช่น "10 ส.ค. กะ 2 · 11 ส.ค. กะ 1" */
export function deliveryTargetLabel(task: DeliveryTask): string {
  return task.targets
    .map((key) => parseShiftTarget(key))
    .filter((target): target is { workDate: string; shift: ShiftCode } => target !== null)
    .map((target) => `${target.workDate} ${target.shift === "s1" ? "กะ 1" : "กะ 2"}`)
    .join(" · ");
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
