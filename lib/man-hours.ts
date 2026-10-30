// ตัวประเมิน man-hour — งานประจำของร้านกินเวลาพนักงานเท่าไร ว่างหรือหนักแค่ไหน.
//
// แหล่งงาน (ไม่นับอีเวนต์พิเศษ เช่น pre-release / Grand Opening / ทัวร์):
//   daily  — เช็คลิสต์รายวันทุกหัวข้อ แยกกะ (กะที่ต้องทำมาจาก /admin/checklist-config)
//   task   — งานสั่งประจำที่ /admin/tasks (สัปดาห์ / 2 สัปดาห์ / เดือน) — ไม่นับงานครั้งเดียว/ช่วงวันที่
//   event  — งานวันกิจกรรมประจำสัปดาห์ (Gym / Lorcana / Riftbound …) เปิด/ปิดได้
//
// เจ้าของใส่ "นาทีต่อครั้ง" ของแต่ละรายการ (+ ทำกี่ครั้งต่อวัน เช่น แพ็คของ 4 ออเดอร์) ·
// ยังไม่ใส่ = ใช้ค่าประมาณจากชื่องาน (ติดป้าย "ค่าเดา").
//
// วิธีแบ่งงานให้คน (ต่อวัน):
//   งานเช็คลิสต์ของกะ → หารคนที่ลงกะนั้นวันนั้น
//   งานสั่ง + งานกิจกรรม → หารทุกคนที่มาทำงานวันนั้น (ช่วยกันทำ)
// เวลาที่ทำงานได้จริงต่อกะ = ชั่วโมงกะ − พัก · ที่เหลือหลังหักงาน = เวลาดูแลลูกค้า/ขายหน้าร้าน.

import { isDueOn, type WorkSchedule, type WorkSpec } from "./work-spec.ts";
import type { ShiftCode } from "./shift-schedule.ts";

export type ManHourSource = "daily" | "task" | "event";

export type ManHourItem = {
  key: string;
  source: ManHourSource;
  /** หัวข้อที่รายการนี้อยู่ (หัวข้อเช็คลิสต์ / หมวดงานสั่ง / ชื่อกิจกรรม) */
  group: string;
  title: string;
  /** daily: กะที่ต้องทำ (ทำแยกกันทุกกะที่ระบุ) */
  shifts: ShiftCode[];
  /** task/event: ลงวันไหน */
  schedule?: WorkSchedule;
  /** ป้ายความถี่ไว้โชว์ */
  frequency: string;
  /** ค่าประมาณจากชื่องาน เมื่อเจ้าของยังไม่ตั้ง */
  guessMinutes: number;
};

export type ManHourEstimate = { minutes: number; times: number };
export type ManHourEstimates = Record<string, ManHourEstimate>;

export type ManHourSettings = {
  /** พักต่อกะ (นาที) */
  breakMinutes: number;
  /** นับงานวันกิจกรรมประจำสัปดาห์ด้วยไหม */
  includeEvents: boolean;
};

export const DEFAULT_SETTINGS: ManHourSettings = { breakMinutes: 60, includeEvents: true };

export type ManHourDoc = {
  branch: string;
  estimates: ManHourEstimates;
  settings: ManHourSettings;
  updatedAt: string | null;
  updatedBy: string | null;
};

/** คีย์สั้นที่ปลอดภัยเป็นชื่อฟิลด์ Firestore — ข้อความรายการเป็นภาษาไทย/มีจุด/ทับ */
export function itemKey(source: ManHourSource, group: string, title: string): string {
  let hash = 5381;
  const text = `${group}\u0000${title.trim()}`;
  for (let i = 0; i < text.length; i += 1) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return `${source}_${hash.toString(36)}`;
}

// ---- ค่าประมาณจากชื่องาน ------------------------------------------------------
// เรียงจากเจาะจงไปกว้าง — ตัวแรกที่ตรงชนะ. เป็นแค่จุดเริ่ม เจ้าของต้องปรับเองให้ตรงร้านจริง.
const GUESSES: Array<[RegExp, number]> = [
  [/ทำความสะอาดใหญ่/, 90],
  [/playmat/i, 45],
  [/sleeve|booster box|box all/i, 60],
  [/นับจำนวนจริง|stocktake|นับ stock/i, 40],
  [/ทำความสะอาด|กวาด|ถูพื้น/, 30],
  [/อัดคลิป|ตัดต่อ|วีดีโอ|วิดีโอ/, 45],
  [/แพ็ค/, 20],
  [/เริ่มกิจกรรม|คุมกิจกรรม/, 60],
  [/ตอบแชท/, 20],
  [/โพส/, 15],
  [/เตรียมพื้นที่|เก็บอุปกรณ์/, 15],
  [/pairing/i, 10],
  [/สรุป|ประกาศ|รายงาน/, 10],
  [/ปิดยอด|เงินสด|ยอดขาย|k-shop|kshop|pos ตรง/i, 10],
  [/เติมสินค้า|ติดราคา|สินค้าใหม่/, 15],
  [/อนุมัติ exp|เควสต์/i, 10],
  [/tracking|ออเดอร์|จัดส่ง/i, 5],
  [/เปิดระบบ|ปิดระบบ|เปิดไฟ|ปิดไฟ|ล็อก/, 5]
];

export function guessMinutes(title: string): number {
  for (const [pattern, minutes] of GUESSES) if (pattern.test(title)) return minutes;
  return 5;
}

// ---- ค่าที่ใช้คำนวณจริง --------------------------------------------------------

export function clampMinutes(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(600, Math.round(n));
}

export function clampTimes(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(50, Math.round(n));
}

/** นาทีของรายการหนึ่งต่อวันที่ต้องทำ (ต่อกะ สำหรับ daily) */
export function itemMinutes(item: ManHourItem, estimates: ManHourEstimates): number {
  const est = estimates[item.key];
  if (!est) return item.guessMinutes;
  return clampMinutes(est.minutes) * clampTimes(est.times);
}

export function isGuess(item: ManHourItem, estimates: ManHourEstimates): boolean {
  return !estimates[item.key];
}

export function normalizeEstimates(raw: unknown): ManHourEstimates {
  if (!raw || typeof raw !== "object") return {};
  const out: ManHourEstimates = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^(daily|task|event)_[0-9a-z]+$/.test(key) || !value || typeof value !== "object") continue;
    const v = value as Partial<ManHourEstimate>;
    out[key] = { minutes: clampMinutes(v.minutes), times: clampTimes(v.times) };
  }
  return out;
}

export function normalizeSettings(raw: unknown): ManHourSettings {
  const v = (raw && typeof raw === "object" ? raw : {}) as Partial<ManHourSettings>;
  const breakMinutes =
    typeof v.breakMinutes === "number" && v.breakMinutes >= 0 && v.breakMinutes <= 180
      ? Math.round(v.breakMinutes)
      : DEFAULT_SETTINGS.breakMinutes;
  return { breakMinutes, includeEvents: v.includeEvents !== false };
}

// ---- สร้างรายการจากแหล่งงาน ----------------------------------------------------

type PhaseLike = { id: string; title: string; shift?: ShiftCode[]; checklist: string[] };

export function dailyItems(phases: PhaseLike[]): ManHourItem[] {
  const items: ManHourItem[] = [];
  for (const phase of phases) {
    const shifts: ShiftCode[] = phase.shift && phase.shift.length ? [...phase.shift].sort() : ["s1", "s2"];
    for (const title of phase.checklist) {
      if (!title.trim()) continue;
      items.push({
        key: itemKey("daily", phase.id, title),
        source: "daily",
        group: phase.title,
        title: title.trim(),
        shifts,
        frequency: shifts.length === 2 ? "ทุกวัน · ทั้ง 2 กะ" : `ทุกวัน · ${shifts[0] === "s1" ? "กะ 1" : "กะ 2"}`,
        guessMinutes: guessMinutes(title)
      });
    }
  }
  return items;
}

/** งานสั่งที่เกิดซ้ำ — ตัดงานครั้งเดียว/ช่วงวันที่ (มักเป็นงานอีเวนต์พิเศษ) และงานที่ปิดไว้ */
export function taskItems(specs: WorkSpec[], frequencyLabel: (spec: WorkSpec) => string): ManHourItem[] {
  return specs
    .filter((spec) => spec.active)
    .filter((spec) => !["once", "range"].includes(spec.schedule.frequency))
    .filter((spec) => !spec.owners.staffCodes?.length)
    .map((spec) => ({
      key: itemKey("task", spec.id, spec.title),
      source: "task" as const,
      group: spec.category || "งานสั่ง",
      title: spec.title,
      shifts: spec.owners.shifts?.length ? [...spec.owners.shifts] : ["s1", "s2"],
      schedule: spec.schedule,
      frequency: frequencyLabel(spec),
      guessMinutes: guessMinutes(spec.title)
    }));
}

type EventLike = { key: string; name: string; activeDays: number[]; items: string[] };

export function eventItems(events: EventLike[]): ManHourItem[] {
  const DAY = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
  return events.flatMap((event) =>
    event.items
      .filter((title) => title.trim())
      .map((title) => ({
        key: itemKey("event", event.key, title),
        source: "event" as const,
        group: event.name,
        title: title.trim(),
        shifts: ["s1", "s2"] as ShiftCode[],
        schedule: { frequency: "event" as const, eventKey: event.key, weekdays: event.activeDays },
        frequency: `วัน${[...event.activeDays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAY[d]).join(" ")}`,
        guessMinutes: guessMinutes(title)
      }))
  );
}

function dueOn(item: ManHourItem, date: string): boolean {
  if (item.source === "daily") return true;
  if (!item.schedule) return false;
  if (item.source === "event") {
    const weekday = new Date(`${date}T12:00:00+07:00`).getUTCDay();
    return (item.schedule.weekdays || []).includes(weekday);
  }
  return isDueOn(item.schedule, date);
}

// ---- คำนวณ -------------------------------------------------------------------

export type ShiftCell = { staffCode: string; workDate: string; shift: ShiftCode };

export type DayLoad = {
  date: string;
  /** นาทีงานเช็คลิสต์ของแต่ละกะ (รวมทั้งกะ ยังไม่หารคน) */
  shiftMinutes: Record<ShiftCode, number>;
  /** นาทีงานสั่ง + งานกิจกรรม ของวันนั้น (ช่วยกันทั้งวัน) */
  poolMinutes: number;
  staff: Record<ShiftCode, string[]>;
};

export function dayLoad(items: ManHourItem[], estimates: ManHourEstimates, settings: ManHourSettings, date: string, cells: ShiftCell[]): DayLoad {
  const shiftMinutes: Record<ShiftCode, number> = { s1: 0, s2: 0 };
  let poolMinutes = 0;
  for (const item of items) {
    if (item.source === "event" && !settings.includeEvents) continue;
    if (!dueOn(item, date)) continue;
    const minutes = itemMinutes(item, estimates);
    if (item.source === "daily") for (const shift of item.shifts) shiftMinutes[shift] += minutes;
    else poolMinutes += minutes;
  }
  const staff: Record<ShiftCode, string[]> = { s1: [], s2: [] };
  for (const cell of cells) if (cell.workDate === date && !staff[cell.shift].includes(cell.staffCode)) staff[cell.shift].push(cell.staffCode);
  return { date, shiftMinutes, poolMinutes, staff };
}

/** งานต่อหัวของคนหนึ่งในวันนั้น (นาที) */
export function perPersonMinutes(load: DayLoad, shift: ShiftCode): number {
  const inShift = load.staff[shift].length;
  const everyone = load.staff.s1.length + load.staff.s2.length;
  if (inShift === 0) return 0;
  return load.shiftMinutes[shift] / inShift + (everyone ? load.poolMinutes / everyone : 0);
}

export function capacityMinutes(workHours: number, settings: ManHourSettings): number {
  return Math.max(0, workHours * 60 - settings.breakMinutes);
}

export type LoadLevel = "light" | "fit" | "tight" | "over";

export const LOAD_LABEL: Record<LoadLevel, string> = {
  light: "ว่างเยอะ",
  fit: "พอดี",
  tight: "แน่น",
  over: "เกินเวลา"
};

/** < 50% ว่างเยอะ · 50–80% พอดี · 80–100% แน่น · > 100% เกินเวลากะ */
export function loadLevel(ratio: number): LoadLevel {
  if (ratio > 1) return "over";
  if (ratio > 0.8) return "tight";
  if (ratio >= 0.5) return "fit";
  return "light";
}

export type StaffMonth = {
  staffCode: string;
  shifts: number;
  capacity: number;
  work: number;
  free: number;
  ratio: number;
  /** วันที่หนักสุด (นาทีงาน) */
  peakDate: string | null;
  peakMinutes: number;
};

export function staffMonth(loads: DayLoad[], workHours: number, settings: ManHourSettings): StaffMonth[] {
  const cap = capacityMinutes(workHours, settings);
  const map = new Map<string, StaffMonth>();
  for (const load of loads) {
    for (const shift of ["s1", "s2"] as ShiftCode[]) {
      const minutes = perPersonMinutes(load, shift);
      for (const code of load.staff[shift]) {
        const row = map.get(code) || { staffCode: code, shifts: 0, capacity: 0, work: 0, free: 0, ratio: 0, peakDate: null, peakMinutes: 0 };
        row.shifts += 1;
        row.capacity += cap;
        row.work += minutes;
        if (minutes > row.peakMinutes) {
          row.peakMinutes = minutes;
          row.peakDate = load.date;
        }
        map.set(code, row);
      }
    }
  }
  return [...map.values()]
    .map((row) => ({
      ...row,
      work: Math.round(row.work),
      peakMinutes: Math.round(row.peakMinutes),
      free: Math.round(row.capacity - row.work),
      ratio: row.capacity ? row.work / row.capacity : 0
    }))
    .sort((a, b) => b.ratio - a.ratio);
}

export type WeekdayRow = {
  weekday: number;
  days: number;
  /** คนเฉลี่ยต่อกะ (เฉพาะวันที่มีคนลงกะนั้น) */
  heads: Record<ShiftCode, number>;
  /** จำนวนวันที่มีคนลงกะนั้น */
  staffedDays: Record<ShiftCode, number>;
  /** นาทีงานต่อคนเฉลี่ย */
  perPerson: Record<ShiftCode, number>;
};

/** เฉลี่ยตามวันในสัปดาห์ (จ → อา) — เห็นว่าวันไหนหนัก วันไหนคนเยอะเกินงาน */
export function weekdayRows(loads: DayLoad[]): WeekdayRow[] {
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.map((weekday) => {
    const days = loads.filter((load) => new Date(`${load.date}T12:00:00+07:00`).getUTCDay() === weekday);
    const heads = { s1: 0, s2: 0 };
    const perPerson = { s1: 0, s2: 0 };
    const staffedDays = { s1: 0, s2: 0 };
    for (const shift of ["s1", "s2"] as ShiftCode[]) {
      const staffed = days.filter((load) => load.staff[shift].length > 0);
      staffedDays[shift] = staffed.length;
      heads[shift] = staffed.length ? staffed.reduce((sum, load) => sum + load.staff[shift].length, 0) / staffed.length : 0;
      perPerson[shift] = staffed.length ? staffed.reduce((sum, load) => sum + perPersonMinutes(load, shift), 0) / staffed.length : 0;
    }
    return { weekday, days: days.length, heads, perPerson, staffedDays };
  });
}

/** วันทั้งหมดของเดือน YYYY-MM */
export function monthDates(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

export function formatHours(minutes: number): string {
  const sign = minutes < 0 ? "−" : "";
  const abs = Math.round(Math.abs(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (!h) return `${sign}${m} นาที`;
  // ยอดรวมทั้งเดือนหลักสิบชั่วโมงขึ้นไป — ปัดเป็นชั่วโมงพอ อ่านง่ายกว่า
  if (h >= 10) return `${sign}${Math.round(abs / 60)} ชม.`;
  return m ? `${sign}${h} ชม. ${m} นาที` : `${sign}${h} ชม.`;
}
