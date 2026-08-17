// แกนกลางของ "การสั่งงาน" ทั้งร้าน — ฟิลด์ชุดเดียวที่ใช้ได้กับงานทุกแบบ.
//
// หลักการที่ตกลงกันไว้: งานประจำ (รายวัน / รายสัปดาห์ / รายเดือน) กับงานที่มอบหมาย (เดี่ยว /
// กลุ่ม) เป็นเรื่องเดียวกัน ต่างกันแค่ **สั่งบ่อยแค่ไหน** และ **ลงวันไหน** ที่เหลือเหมือนกันหมด:
//
//   ใครทำ        — กะ (งานประจำ) หรือ ชื่อคน (งานที่มอบหมาย)
//   ลงวันไหน     — ทุกวัน / วันในสัปดาห์ / วันที่ของเดือน / ช่วงวันที่
//   เวลา         — เริ่มทำได้ตั้งแต่ · ต้องจบไม่เกิน
//   ส่งงานแบบไหน — ติ๊ก / พิมพ์ / ตัวเลข / รูป / ลิงก์ / เลือกตัวเลือก (ItemAnswer)
//   รายละเอียด   — อธิบายงาน + ปุ่มลิงก์ไปหน้างานจริง
//
// ไฟล์นี้เก็บเฉพาะ type + logic ล้วน (ถึงกำหนดวันนี้ไหม · กะนี้ต้องทำไหม · เลยเวลาหรือยัง)
// เพื่อให้ทุกหน้าจอตัดสินใจแบบเดียวกัน และ test ได้โดยไม่ต้องแตะ Firestore.

import type { ItemAnswer } from "./checklist-overrides.ts";
import type { ItemLink } from "./checklist-links.ts";
import type { ShiftCode } from "./shift-schedule.ts";
import { weeklyEvents } from "./weekly-event-tasks.ts";

// ---- สั่งบ่อยแค่ไหน + ลงวันไหน ------------------------------------------------

export type WorkFrequency = "daily" | "weekly" | "biweekly" | "monthly" | "event" | "once" | "range";

export const FREQUENCY_LABEL: Record<WorkFrequency, string> = {
  daily: "ทุกวัน",
  weekly: "ทุกสัปดาห์",
  biweekly: "สัปดาห์เว้นสัปดาห์",
  monthly: "ทุกเดือน",
  event: "ทุกวันที่มีกิจกรรม",
  once: "ครั้งเดียว",
  range: "ช่วงวันที่"
};

/** 0 = อาทิตย์ … 6 = เสาร์ (ตรงกับ Date.getDay ของเวลาไทย) */
export const WEEKDAY_LABEL = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

export type WorkSchedule = {
  frequency: WorkFrequency;
  /** weekly: ลงวันไหนของสัปดาห์ (ว่าง = ทุกวันในสัปดาห์) */
  weekdays?: number[];
  /** monthly: ลงวันที่เท่าไหร่ของเดือน 1–31 (ว่าง = วันแรกของเดือน) */
  monthDays?: number[];
  /** event: ผูกกับกิจกรรมประจำสัปดาห์ (key ของ weeklyEvents) — ลงเองตามวันที่กิจกรรมนั้นจัด */
  eventKey?: string;
  /**
   * biweekly / once / range: วันเริ่ม–วันจบ (once ใช้ startDate อย่างเดียว).
   * biweekly ใช้ startDate เป็นวันหมุด แล้วลงซ้ำทุก 14 วันนับจากวันนั้น (วันในสัปดาห์เดียวกัน).
   */
  startDate?: string;
  endDate?: string;
};

/** จำนวนวันเต็มระหว่างสองวัน YYYY-MM-DD (ยึดเที่ยงวันเวลาไทยกันเพี้ยนข้ามช่วงเวลา) */
export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T12:00:00+07:00`);
  const end = Date.parse(`${to}T12:00:00+07:00`);
  return Math.round((end - start) / 86_400_000);
}

/** วันในสัปดาห์ของ YYYY-MM-DD ตามเวลาไทย */
export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00+07:00`).getUTCDay();
}

/** วันที่ของเดือน (1–31) */
export function monthDayOf(date: string): number {
  return Number(date.slice(8, 10));
}

/** วันสุดท้ายของเดือนที่วันนี้อยู่ — ใช้ยึดงานรายเดือนที่ตั้งวันที่ 31 ในเดือนที่มี 30 วัน */
export function lastDayOfMonth(date: string): number {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * งานนี้ต้องทำในวันนี้ไหม.
 * - ทุกวัน           → ใช่เสมอ
 * - ทุกสัปดาห์       → ตรงวันที่เลือกไว้ (ไม่เลือก = ทุกวัน)
 * - ทุกเดือน         → ตรงวันที่ของเดือน (ไม่เลือก = วันที่ 1) และวันที่เกินเดือนสั้น เลื่อนมาวันสุดท้าย
 * - ครั้งเดียว/ช่วง → อยู่ในช่วงวันที่
 */
export function isDueOn(schedule: WorkSchedule, date: string): boolean {
  switch (schedule.frequency) {
    case "daily":
      return true;
    case "weekly": {
      const days = schedule.weekdays || [];
      return days.length === 0 || days.includes(weekdayOf(date));
    }
    case "biweekly": {
      // ลงทุก 2 สัปดาห์นับจากวันหมุด (startDate) — วันในสัปดาห์เดียวกันเสมอ
      // เพราะ 14 หารด้วย 7 ลงตัว. ก่อนวันหมุดยังไม่ถึงรอบ = ยังไม่ต้องทำ
      if (!schedule.startDate || date < schedule.startDate) return false;
      return daysBetween(schedule.startDate, date) % 14 === 0;
    }
    case "monthly": {
      const days = (schedule.monthDays || []).length ? schedule.monthDays! : [1];
      const today = monthDayOf(date);
      const last = lastDayOfMonth(date);
      // วันที่ 31 ในเดือนที่มี 30 วัน → ถือว่าครบกำหนดวันสุดท้ายของเดือนนั้น
      return days.some((day) => day === today || (day > last && today === last));
    }
    case "event": {
      // งานที่ผูกกับกิจกรรม เช่น "ทุกวันที่มี Gym Pokemon" — วันจัดกิจกรรมเปลี่ยนเมื่อไหร่
      // งานก็ตามไปเอง ไม่ต้องมาไล่แก้วันในสัปดาห์ทีละงาน
      const event = weeklyEvents.find((item) => item.key === schedule.eventKey);
      return Boolean(event && event.activeDays.includes(weekdayOf(date)));
    }
    case "once":
      return Boolean(schedule.startDate) && schedule.startDate === date;
    case "range": {
      if (!schedule.startDate || !schedule.endDate) return false;
      return date >= schedule.startDate && date <= schedule.endDate;
    }
    default:
      return false;
  }
}

/** อ่านออกว่า "ลงวันไหน" — ใช้บนการ์ดทั้งฝั่งเจ้าของและพนักงาน */
export function scheduleLabel(schedule: WorkSchedule): string {
  switch (schedule.frequency) {
    case "daily":
      return "ทุกวัน";
    case "weekly": {
      const days = schedule.weekdays || [];
      return days.length ? `ทุกสัปดาห์ · วัน${days.map((day) => WEEKDAY_LABEL[day]).join(" ")}` : "ทุกสัปดาห์";
    }
    case "biweekly":
      return schedule.startDate
        ? `ทุก 2 สัปดาห์ · วัน${WEEKDAY_LABEL[weekdayOf(schedule.startDate)]} · เริ่ม ${schedule.startDate}`
        : "ทุก 2 สัปดาห์";
    case "monthly": {
      const days = schedule.monthDays || [];
      return days.length ? `ทุกเดือน · วันที่ ${days.join(", ")}` : "ทุกเดือน · วันที่ 1";
    }
    case "event": {
      const event = weeklyEvents.find((item) => item.key === schedule.eventKey);
      return event ? `ทุกวันที่มี ${event.name}` : "ตามกิจกรรม";
    }
    case "once":
      return schedule.startDate ? `วันที่ ${schedule.startDate}` : "ครั้งเดียว";
    case "range":
      return schedule.startDate && schedule.endDate ? `${schedule.startDate} → ${schedule.endDate}` : "ช่วงวันที่";
    default:
      return "";
  }
}

// ---- ใครทำ -------------------------------------------------------------------

/** งานประจำสั่งเป็น "กะ"; งานที่มอบหมายสั่งเป็น "คน" — เดี่ยวคนเดียว หรือกลุ่มช่วยกัน */
export type WorkOwners = {
  /** กะที่ต้องทำ (ว่าง = ทุกกะ) */
  shifts?: ShiftCode[];
  /** รหัสพนักงานที่รับผิดชอบ (งานที่มอบหมาย) */
  staffCodes?: string[];
  /** กลุ่ม = ใครในทีมส่งก็นับ · เดี่ยว = เจ้าของงานคนนั้นต้องส่งเอง */
  mode?: "single" | "group";
};

export function ownerModeLabel(owners: WorkOwners): string {
  if (owners.staffCodes?.length) return (owners.mode || "single") === "group" ? "งานกลุ่ม" : "งานเดี่ยว";
  return "งานประจำ";
}

/** กะนี้ต้องทำงานนี้ไหม (ไม่ระบุกะไว้ = ทุกกะ, คนที่ไม่ได้ลงกะ = เห็นทุกงาน) */
export function isForShift(owners: WorkOwners, shift: ShiftCode | null): boolean {
  const shifts = owners.shifts || [];
  if (shifts.length === 0 || shifts.length === 2) return true;
  if (!shift) return true;
  return shifts.includes(shift);
}

/** คนนี้ต้องทำงานนี้ไหม (งานที่มอบหมายเท่านั้น — งานประจำใช้กะแทน) */
export function isForStaff(owners: WorkOwners, staffCode: string | null): boolean {
  const codes = owners.staffCodes || [];
  if (codes.length === 0) return true;
  return Boolean(staffCode && codes.includes(staffCode));
}

// ---- เวลา --------------------------------------------------------------------

export type WorkTiming = {
  /** เริ่มกดส่งได้ตั้งแต่ HH:MM (ว่าง = ได้ตลอดวัน) */
  openTime?: string;
  /** ต้องจบไม่เกิน HH:MM (ว่าง = ภายในวัน) */
  dueTime?: string;
};

export function isHhMm(value: string | undefined): boolean {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export type TimingState = "before_open" | "open" | "late" | "anytime";

/** ตอนนี้ (HH:MM) ทำได้ไหม / เลยกำหนดหรือยัง */
export function timingStateAt(timing: WorkTiming, nowHhMm: string): TimingState {
  const hasOpen = isHhMm(timing.openTime);
  const hasDue = isHhMm(timing.dueTime);
  if (!hasOpen && !hasDue) return "anytime";
  if (hasOpen && nowHhMm < timing.openTime!) return "before_open";
  if (hasDue && nowHhMm > timing.dueTime!) return "late";
  return "open";
}

export function timingLabel(timing: WorkTiming): string {
  const open = isHhMm(timing.openTime) ? timing.openTime : "";
  const due = isHhMm(timing.dueTime) ? timing.dueTime : "";
  if (open && due) return `${open}–${due}`;
  if (due) return `ภายใน ${due}`;
  if (open) return `เริ่ม ${open}`;
  return "ได้ตลอดวัน";
}

// ---- งานหนึ่งชิ้น ------------------------------------------------------------

/**
 * "งานสั่ง" หนึ่งชิ้น — ใช้ได้ทั้งงานประจำและงานที่มอบหมาย. หมวดหมู่เป็นแค่ป้ายจัดกลุ่ม
 * (เปิดร้าน / Stock / กิจกรรม / ทำความสะอาด …) ไม่ได้เปลี่ยนความสามารถของงานเลย —
 * ทุกงานตั้งค่าได้เหมือนกันหมด.
 */
export type WorkSpec = {
  id: string;
  title: string;
  /** อธิบายว่าต้องทำอะไร / ทำยังไง */
  detail?: string;
  /** งานเสร็จหน้าตาเป็นยังไง */
  expectedResult?: string;
  /** ป้ายหมวดหมู่สำหรับจัดกลุ่มบนหน้าจอ */
  category?: string;
  schedule: WorkSchedule;
  owners: WorkOwners;
  timing: WorkTiming;
  /** ส่งงานแบบไหน (ไม่ตั้ง = ติ๊กว่าทำแล้ว) */
  answer?: ItemAnswer;
  /** ปุ่มลิงก์ไปหน้างานจริง */
  links?: ItemLink[];
  /** ปิดไว้ชั่วคราวโดยไม่ต้องลบ */
  active: boolean;
  order: number;
};

/** งานที่พนักงานคนนี้ต้องเห็นในวันนี้ (กะ + วัน + ตัวคน + ยังเปิดใช้) */
export function specsDueFor(
  specs: WorkSpec[],
  input: { date: string; shift: ShiftCode | null; staffCode: string | null }
): WorkSpec[] {
  return specs
    .filter((spec) => spec.active)
    .filter((spec) => isDueOn(spec.schedule, input.date))
    .filter((spec) => isForShift(spec.owners, input.shift))
    .filter((spec) => isForStaff(spec.owners, input.staffCode))
    .sort((a, b) => a.order - b.order);
}

/** ล้างงานหนึ่งชิ้นก่อนบันทึก — ตัดค่าที่ผิดรูปแบบทิ้ง ไม่ให้ไปล็อกหน้าจอพนักงานทีหลัง */
export function normalizeWorkSpec(raw: Partial<WorkSpec>, index: number): WorkSpec | null {
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) return null;
  const id = (typeof raw.id === "string" && raw.id.trim()) || `task-${index + 1}`;
  const frequency: WorkFrequency = (
    ["daily", "weekly", "biweekly", "monthly", "event", "once", "range"] as WorkFrequency[]
  ).includes(raw.schedule?.frequency as WorkFrequency)
    ? (raw.schedule!.frequency as WorkFrequency)
    : "daily";
  const numbers = (value: unknown, min: number, max: number) =>
    Array.isArray(value)
      ? Array.from(new Set(value.filter((n): n is number => typeof n === "number" && n >= min && n <= max))).sort((a, b) => a - b)
      : [];
  const isDate = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

  const schedule: WorkSchedule = { frequency };
  if (frequency === "weekly") {
    const weekdays = numbers(raw.schedule?.weekdays, 0, 6);
    if (weekdays.length) schedule.weekdays = weekdays;
  }
  if (frequency === "monthly") {
    const monthDays = numbers(raw.schedule?.monthDays, 1, 31);
    if (monthDays.length) schedule.monthDays = monthDays;
  }
  if (frequency === "event" && typeof raw.schedule?.eventKey === "string" && raw.schedule.eventKey.trim()) {
    schedule.eventKey = raw.schedule.eventKey.trim();
  }
  if (frequency === "biweekly" || frequency === "once" || frequency === "range") {
    if (isDate(raw.schedule?.startDate)) schedule.startDate = raw.schedule!.startDate;
    if (frequency === "range" && isDate(raw.schedule?.endDate)) schedule.endDate = raw.schedule!.endDate;
  }

  const owners: WorkOwners = {};
  const shifts = Array.isArray(raw.owners?.shifts)
    ? raw.owners!.shifts!.filter((shift): shift is ShiftCode => shift === "s1" || shift === "s2")
    : [];
  if (shifts.length) owners.shifts = Array.from(new Set(shifts));
  const staffCodes = Array.isArray(raw.owners?.staffCodes)
    ? raw.owners!.staffCodes!.filter((code): code is string => typeof code === "string" && code.trim().length > 0)
    : [];
  if (staffCodes.length) {
    owners.staffCodes = Array.from(new Set(staffCodes));
    owners.mode = raw.owners?.mode === "group" ? "group" : "single";
  }

  const timing: WorkTiming = {};
  if (isHhMm(raw.timing?.openTime)) timing.openTime = raw.timing!.openTime;
  if (isHhMm(raw.timing?.dueTime)) timing.dueTime = raw.timing!.dueTime;

  const spec: WorkSpec = {
    id,
    title,
    schedule,
    owners,
    timing,
    active: raw.active !== false,
    order: typeof raw.order === "number" ? raw.order : index
  };
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  if (text(raw.detail)) spec.detail = text(raw.detail);
  if (text(raw.expectedResult)) spec.expectedResult = text(raw.expectedResult);
  if (text(raw.category)) spec.category = text(raw.category);
  if (raw.answer) spec.answer = raw.answer;
  if (Array.isArray(raw.links) && raw.links.length) spec.links = raw.links;
  return spec;
}

/** ล้างทั้งลิสต์ + ตั้งลำดับใหม่ให้เรียงติดกัน */
export function normalizeWorkSpecs(raw: unknown): WorkSpec[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 300)
    .map((item, index) => normalizeWorkSpec((item || {}) as Partial<WorkSpec>, index))
    .filter((spec): spec is WorkSpec => Boolean(spec))
    .map((spec, index) => ({ ...spec, order: index }));
}

/** จัดกลุ่มตามหมวดหมู่ โดยคงลำดับที่เจ้าของจัดไว้ */
export function groupByCategory(specs: WorkSpec[]): Array<{ category: string; specs: WorkSpec[] }> {
  const out: Array<{ category: string; specs: WorkSpec[] }> = [];
  for (const spec of specs) {
    const category = (spec.category || "").trim() || "ทั่วไป";
    const bucket = out.find((group) => group.category === category);
    if (bucket) bucket.specs.push(spec);
    else out.push({ category, specs: [spec] });
  }
  return out;
}
