// ตัวกรอง "เดือน" ของหน้างานที่มอบหมาย (/admin/projects).
//
// เดิมกระดานเทงานทุกเดือนมากองรวมกัน — งานเดือนนี้ปนงานเมื่อสามเดือนก่อน ทำให้ดูไม่ออกว่า
// รอบนี้สั่งอะไรไปบ้างและใครยังค้าง. หน้านี้จึงล็อกให้ดูทีละเดือน: ค่าเริ่มต้นคือ **เดือนก่อนหน้า**
// (รอบที่เพิ่งปิดไป ซึ่งเป็นรอบที่เจ้าของต้องตรวจ/ตัดคะแนนจริง) แล้วย้อนหลังได้ไม่จำกัด
// ส่วนอนาคตห้ามเลย — ไปได้ไกลสุดแค่เดือนปัจจุบัน.
//
// วันที่ที่ใช้ตัดสินว่างานอยู่เดือนไหน คือ "วันที่ของงาน" (workDate) = วันเริ่มงาน `startDate`
// ซึ่งเป็นวันที่เจ้าของสั่งให้เริ่มลงมือ. งานที่ไม่มีวันที่หรือวันที่เสียถูกกันออกไปอยู่กลุ่ม
// "ต้องตรวจสอบข้อมูล" แทนที่จะปนอยู่ในรายการของเดือนใดเดือนหนึ่ง.
//
// ไฟล์นี้เป็น pure logic ล้วน (ไม่แตะ network/DOM) ให้ unit test ได้ตรงๆ.

import { isOverdue, type ProjectStatus, type WorkProject } from "./work-projects.ts";

/** ชื่อ query string ที่เก็บเดือนที่เลือกไว้บน URL — แชร์ลิงก์/รีเฟรชแล้วอยู่เดือนเดิม */
export const PROJECT_MONTH_PARAM = "month";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** "2026-08" เท่านั้น (รวมถึงกันเดือน 00/13) */
export function isMonthKey(value: unknown): value is string {
  return typeof value === "string" && MONTH_RE.test(value);
}

/** วันที่ที่มีอยู่จริงบนปฏิทิน — กัน "2026-02-31" ที่ผ่าน regex แต่ไม่มีอยู่จริง */
export function isRealDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const at = new Date(Date.UTC(year, month - 1, day));
  return at.getUTCFullYear() === year && at.getUTCMonth() === month - 1 && at.getUTCDate() === day;
}

/** "2026-08-19" → "2026-08" (วันที่เสีย = null) */
export function monthOfDate(date: unknown): string | null {
  return isRealDate(date) ? date.slice(0, 7) : null;
}

/** เดือนก่อนหน้า / เดือนถัดไป (ข้ามปีให้เอง: 2026-01 − 1 = 2025-12) */
export function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split("-").map(Number);
  const at = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * เดือนที่ไกลที่สุดที่เลือกได้ = เดือนปัจจุบัน (อนาคตยังไม่มีข้อมูล).
 * ถ้าค่า today ที่ส่งมาเพี้ยน ให้ยึดวันจริงตามเวลาไทย แทนที่จะคืนเดือนพัง.
 */
export function latestSelectableMonth(today: string): string {
  return monthOfDate(today) ?? bangkokMonthNow();
}

function bangkokMonthNow(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).format(
    new Date()
  );
}

/** ค่าเริ่มต้นของหน้า = เดือนก่อนหน้า (รอบที่เพิ่งปิด — รอบที่ต้องตรวจจริง) */
export function defaultProjectMonth(today: string): string {
  return shiftMonth(latestSelectableMonth(today), -1);
}

/** อยู่เดือนปัจจุบันแล้วหรือยัง — ปุ่ม "เดือนถัดไป" ต้อง disabled ตอนนี้ */
export function isLatestMonth(month: string, today: string): boolean {
  return month >= latestSelectableMonth(today);
}

/**
 * เดือนที่จะแสดงจริง จากค่าบน URL. ไม่มีค่า / รูปแบบเพี้ยน / เป็นเดือนอนาคต →
 * ตกกลับไปที่ค่าเริ่มต้น (เดือนก่อนหน้า) เสมอ.
 */
export function resolveProjectMonth(raw: unknown, today: string): string {
  if (!isMonthKey(raw)) return defaultProjectMonth(today);
  if (raw > latestSelectableMonth(today)) return defaultProjectMonth(today);
  return raw;
}

/** วันแรก–วันสุดท้ายของเดือน (รวมปลายทั้งสองข้าง) */
export function monthRange(month: string): { start: string; end: string } {
  const [year, mon] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
}

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
] as const;

/** "2026-08" → "สิงหาคม 2569" (พ.ศ. — ไม่ parse Date จึงไม่มีปัญหา timezone) */
export function thaiMonthLabel(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  return `${THAI_MONTHS[(mon || 1) - 1] ?? month} ${year + 543}`;
}

/** วันที่ของงานที่ใช้ตัดสินว่าอยู่เดือนไหน — วันเริ่มงาน (ไม่มี/เสีย = null) */
export function projectWorkDate(project: Pick<WorkProject, "startDate">): string | null {
  return isRealDate(project?.startDate) ? project.startDate : null;
}

/**
 * แยกงานออกเป็นของ "เดือนที่เลือก" กับ "ต้องตรวจสอบข้อมูล" (ไม่มีวันที่/วันที่เสีย).
 * งานของเดือนอื่นถูกทิ้งไปเลย — ห้ามปนกันเด็ดขาด.
 */
export function splitProjectsByMonth<T extends Pick<WorkProject, "startDate">>(
  projects: T[],
  month: string
): { inMonth: T[]; invalid: T[] } {
  const { start, end } = monthRange(month);
  const inMonth: T[] = [];
  const invalid: T[] = [];
  for (const project of projects || []) {
    const workDate = projectWorkDate(project);
    if (!workDate) {
      invalid.push(project);
      continue;
    }
    if (workDate >= start && workDate <= end) inMonth.push(project);
  }
  return { inMonth, invalid };
}

export type ProjectMonthSummary = {
  /** จำนวนงานทั้งหมดของเดือนนี้ */
  total: number;
  /** ปิดงานแล้ว */
  done: number;
  /** ยังทำอยู่และยังไม่เลยกำหนด */
  pending: number;
  /** ยังทำอยู่แต่เลยวันสิ้นสุดแล้ว */
  overdue: number;
  /** ยกเลิก (นับรวมใน total แต่ไม่ใช่ทั้งเสร็จและค้าง) */
  cancelled: number;
};

/**
 * ตัวเลขสรุปหัวกระดาน — ต้องคิดจากงาน "เดือนที่เลือก" ที่ส่งเข้ามาเท่านั้น
 * (ผู้เรียกกรองเดือนมาก่อนแล้วด้วย splitProjectsByMonth)
 */
export function summarizeProjects(
  projects: Array<Pick<WorkProject, "status" | "endDate">>,
  today: string
): ProjectMonthSummary {
  const summary: ProjectMonthSummary = { total: 0, done: 0, pending: 0, overdue: 0, cancelled: 0 };
  for (const project of projects || []) {
    summary.total += 1;
    const status: ProjectStatus = project.status;
    if (status === "done") summary.done += 1;
    else if (status === "cancelled") summary.cancelled += 1;
    else if (isOverdue(project, today)) summary.overdue += 1;
    else summary.pending += 1;
  }
  return summary;
}
