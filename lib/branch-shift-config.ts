// เวลาเข้างานของแต่ละกะ แยกตามสาขา — แก้ได้จากหน้าเว็บ ไม่ต้องแก้โค้ด.
//
// ช่วงเปิดสาขาใหม่ เวลายังไม่นิ่ง (เสนาเฟสต์เข้า 09:30 วันนี้ พรุ่งนี้อาจขยับ) เจ้าของจึงต้อง
// เพิ่ม/ลบตัวเลือกเวลาเองได้ที่ /admin/schedule. ค่าใน store-config.ts เป็นแค่ค่าเริ่มต้น
// ตอนยังไม่เคยตั้ง — ตั้งแล้วค่าใน Firestore ชนะเสมอ.
//
// เก็บที่ `sop_branch_shifts/{branch}`:
//   { branch, starts: { s1: ["09:30","10:00"], s2: ["12:30","13:00"] }, closeTime?, workHours? }

import { branchConfig } from "./store-config.ts";
import type { ShiftCode } from "./shift-schedule.ts";

export const BRANCH_SHIFTS_COLLECTION = "sop_branch_shifts";

export type BranchShiftConfig = {
  branch: string;
  /** เวลาเข้างานที่เลือกได้ของแต่ละกะ (ค่าแรก = ค่าเริ่มต้นของกะนั้น) */
  starts: Record<ShiftCode, string[]>;
  /** เวลาปิดร้าน HH:MM — ว่าง = ไม่เช็คว่ามีคนอยู่ถึงปิดร้านไหม */
  closeTime?: string;
  /** ชั่วโมงทำงานต่อกะ (ปกติ 9) */
  workHours: number;
};

export const DEFAULT_WORK_HOURS = 9;
/** จำนวนตัวเลือกเวลาต่อกะที่เก็บได้ — พอสำหรับช่วงลองเวลา แต่ไม่ให้ dropdown ยาวจนเลือกยาก */
export const MAX_START_OPTIONS = 8;

export function isHhMm(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** เรียงเวลา + ตัดซ้ำ + ตัดค่าที่ผิดรูปแบบทิ้ง */
export function cleanStartList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const times = raw.filter(isHhMm);
  return [...new Set(times)].sort().slice(0, MAX_START_OPTIONS);
}

/** ค่าเริ่มต้นของสาขา (จากโค้ด) เมื่อยังไม่เคยตั้งใน Firestore */
export function defaultBranchShiftConfig(branch: string): BranchShiftConfig {
  const config = branchConfig(branch);
  return {
    branch,
    starts: { s1: [...config.shiftStarts.s1], s2: [...config.shiftStarts.s2] },
    ...(config.closeTime ? { closeTime: config.closeTime } : {}),
    workHours: DEFAULT_WORK_HOURS
  };
}

/**
 * รวมค่าที่เก็บไว้กับค่าเริ่มต้น — กะที่ถูกลบจนว่างจะถอยกลับไปใช้ค่าเริ่มต้น เพื่อไม่ให้
 * ตารางเหลือกะที่ไม่มีเวลาให้เลือกเลย (ลงกะไม่ได้ทั้งสาขา).
 */
export function normalizeBranchShiftConfig(branch: string, raw: unknown): BranchShiftConfig {
  const fallback = defaultBranchShiftConfig(branch);
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<BranchShiftConfig>;
  const s1 = cleanStartList(value.starts?.s1);
  const s2 = cleanStartList(value.starts?.s2);
  const workHours =
    typeof value.workHours === "number" && value.workHours > 0 && value.workHours <= 12
      ? value.workHours
      : fallback.workHours;
  const closeTime = isHhMm(value.closeTime) ? value.closeTime : fallback.closeTime;
  return {
    branch,
    starts: { s1: s1.length ? s1 : fallback.starts.s1, s2: s2.length ? s2 : fallback.starts.s2 },
    ...(closeTime ? { closeTime } : {}),
    workHours
  };
}

/** เพิ่มเวลาเข้างานหนึ่งตัวเลือก (ซ้ำ/ผิดรูปแบบ/เต็มแล้ว = ไม่เปลี่ยน) */
export function addStartOption(config: BranchShiftConfig, shift: ShiftCode, time: string): BranchShiftConfig {
  if (!isHhMm(time) || config.starts[shift].includes(time) || config.starts[shift].length >= MAX_START_OPTIONS) {
    return config;
  }
  return { ...config, starts: { ...config.starts, [shift]: [...config.starts[shift], time].sort() } };
}

/** ลบตัวเลือกเวลา — กะหนึ่งต้องเหลืออย่างน้อยหนึ่งเวลาเสมอ */
export function removeStartOption(config: BranchShiftConfig, shift: ShiftCode, time: string): BranchShiftConfig {
  const next = config.starts[shift].filter((option) => option !== time);
  if (next.length === 0) return config;
  return { ...config, starts: { ...config.starts, [shift]: next } };
}

/** เวลาเลิกงานของเวลาเข้างานนั้น ตามชั่วโมงทำงานของสาขา */
export function endTimeFor(config: BranchShiftConfig, start: string): string {
  const match = start.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return start;
  const minutes = (Number(match[1]) * 60 + Number(match[2]) + config.workHours * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** ป้ายอ่านง่ายของตัวเลือกหนึ่ง เช่น "09:30–18:30" */
export function startOptionLabel(config: BranchShiftConfig, start: string): string {
  return `${start}–${endTimeFor(config, start)}`;
}
