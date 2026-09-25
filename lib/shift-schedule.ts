// Shift-planning core logic for the SOP schedule planner.
//
// Owners (Champ + เนม — see owner.ts) plan a monthly grid where every staff member is
// assigned a shift per day. There are exactly two shifts a day; they differ ONLY by
// entry time and both run 9 hours. The planner enforces two fairness rules:
//   1. every day needs at least two working staff, and
//   2. each person should get a roughly even mix of shift 1 vs shift 2 (no one stuck
//      on a single shift all month).
//
// This module is pure (no Firestore / no DOM) so it can be unit-tested and reused by
// both the grid UI and any server-side balance check.

import { branchConfig, branchShortName } from "./store-config.ts";

/** Shift 1 = opening shift (เปิดร้าน). Shift 2 = closing shift (ปิดร้าน). */
export type ShiftCode = "s1" | "s2";

/** A planned assignment for one staff-day. */
export type ShiftAssignment = "s1" | "s2" | "off" | "leave_personal" | "leave_sick";

export const SHIFT_WORK_HOURS = 9;

/**
 * เวลาเข้างานของสาขาหลัก (บางแค) — คงไว้เพื่อความเข้ากันได้ของโค้ดเดิม.
 * โค้ดใหม่ควรใช้ `shiftStartOptions(shift, branch)` เพราะแต่ละสาขาเข้างานคนละเวลา.
 */
export const SHIFT_START_OPTIONS: Record<ShiftCode, string[]> = {
  s1: ["09:00", "11:00"],
  s2: ["11:30", "13:00"]
};

/** เวลาเข้างานที่เลือกได้ของกะนั้นในสาขานั้น (ไม่ระบุสาขา = สาขาหลัก) */
export function shiftStartOptions(shift: ShiftCode, branch?: string): string[] {
  if (!branch) return SHIFT_START_OPTIONS[shift];
  return branchConfig(branch).shiftStarts[shift] ?? SHIFT_START_OPTIONS[shift];
}

/** The default (first) start time for a shift. */
export function defaultShiftStart(shift: ShiftCode, branch?: string): string {
  return shiftStartOptions(shift, branch)[0];
}

/** True when `start` is a valid dropdown option for the given shift. */
export function isValidShiftStart(shift: ShiftCode, start: string, branch?: string): boolean {
  return shiftStartOptions(shift, branch).includes(start);
}

/** Adds `SHIFT_WORK_HOURS` to an "HH:MM" start and returns the "HH:MM" end. */
export function shiftEndTime(start: string): string {
  const match = start.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return start;
  const startMinutes = Number(match[1]) * 60 + Number(match[2]);
  const endMinutes = (startMinutes + SHIFT_WORK_HOURS * 60) % (24 * 60);
  const hour = Math.floor(endMinutes / 60);
  const minute = endMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Human label for a shift code. */
export function shiftLabel(shift: ShiftCode): string {
  return shift === "s1" ? "กะ 1 (เปิดร้าน)" : "กะ 2 (ปิดร้าน)";
}

export function isWorkingAssignment(value: ShiftAssignment): value is ShiftCode {
  return value === "s1" || value === "s2";
}

export function isLeaveAssignment(value: ShiftAssignment): boolean {
  return value === "leave_personal" || value === "leave_sick";
}

/** One planned cell: which shift + (for working shifts) the chosen entry time. */
export type PlanCell = {
  staffCode: string;
  workDate: string; // YYYY-MM-DD
  assignment: ShiftAssignment;
  /** entry time HH:MM — only meaningful when assignment is s1/s2 */
  startTime?: string;
  /** สาขาที่เข้ากะวันนั้น — ไม่ระบุ = สาขาหลักเดิม (ตารางที่วางไว้ก่อนมีสาขา 2) */
  branch?: string;
};

/** Per-staff totals shown in the summary column. */
export type StaffSummary = {
  staffCode: string;
  totalWorkDays: number;
  s1Count: number;
  s2Count: number;
  offCount: number;
  personalLeave: number;
  sickLeave: number;
  /** |s1Count - s2Count|; 0 = perfectly balanced across the two shifts */
  shiftImbalance: number;
};

/** Builds the per-staff summary from a flat list of plan cells. */
export function summariseStaff(staffCode: string, cells: PlanCell[]): StaffSummary {
  const mine = cells.filter((cell) => cell.staffCode === staffCode);
  const count = (predicate: (a: ShiftAssignment) => boolean) =>
    mine.filter((cell) => predicate(cell.assignment)).length;

  const s1Count = count((a) => a === "s1");
  const s2Count = count((a) => a === "s2");

  return {
    staffCode,
    totalWorkDays: s1Count + s2Count,
    s1Count,
    s2Count,
    offCount: count((a) => a === "off"),
    personalLeave: count((a) => a === "leave_personal"),
    sickLeave: count((a) => a === "leave_sick"),
    shiftImbalance: Math.abs(s1Count - s2Count)
  };
}

/** A flagged problem the planner should surface to the owner. */
export type BalanceIssue = {
  kind: "understaffed" | "shift_imbalance" | "branch_overlap" | "branch_hop" | "no_closer";
  /** workDate for understaffed, staffCode for shift_imbalance */
  ref: string;
  message: string;
};

export const MIN_STAFF_PER_DAY = 2;

/** สาขาของเซลล์ (ตารางเก่าที่ยังไม่มีสาขา = สาขาหลัก) */
export function cellBranch(cell: PlanCell, fallback = "bangkae"): string {
  return cell.branch || fallback;
}

/** นาทีของวันจาก "HH:MM" (คืน null เมื่อรูปแบบผิด) */
function minutesOf(time: string | undefined): number | null {
  const match = (time || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** ช่วงเวลาทำงานของเซลล์เป็นนาที [start, end) — กะยาว 9 ชั่วโมงเท่ากันทุกสาขา */
export function cellWindow(cell: PlanCell, fallbackBranch = "bangkae"): { start: number; end: number } | null {
  if (!isWorkingAssignment(cell.assignment)) return null;
  const start = minutesOf(cell.startTime || defaultShiftStart(cell.assignment, cellBranch(cell, fallbackBranch)));
  if (start === null) return null;
  return { start, end: start + SHIFT_WORK_HOURS * 60 };
}

/**
 * Every working day (a day that has at least one assignment) must have at least
 * MIN_STAFF_PER_DAY people on a working shift — **นับแยกรายสาขา** เพราะสองสาขาเปิดพร้อมกัน
 * คนที่อยู่เสนาเฟสต์ช่วยบางแคไม่ได้. ตารางเก่าที่ไม่มีสาขาถูกนับเป็นสาขาหลัก.
 */
export function findUnderstaffedDays(cells: PlanCell[], workDates: string[], fallbackBranch = "bangkae"): BalanceIssue[] {
  const issues: BalanceIssue[] = [];
  const branches = [...new Set(cells.map((cell) => cellBranch(cell, fallbackBranch)))];
  for (const date of workDates) {
    for (const branch of branches) {
      const ofDay = cells.filter((cell) => cell.workDate === date && cellBranch(cell, fallbackBranch) === branch);
      const anyAssignment = ofDay.some((cell) => cell.assignment !== "off");
      if (!anyAssignment) continue; // ยังไม่ได้แตะวันนั้นของสาขานี้ — ไม่ต้องเตือน
      const working = ofDay.filter((cell) => isWorkingAssignment(cell.assignment));
      if (working.length < MIN_STAFF_PER_DAY) {
        issues.push({
          kind: "understaffed",
          ref: `${date}__${branch}`,
          message: `${date} ${branchShortName(branch)}: มีคนเข้างานแค่ ${working.length} คน (ต้องอย่างน้อย ${MIN_STAFF_PER_DAY})`
        });
      }
    }
  }
  return issues;
}

/**
 * คนคนเดียวถูกลงกะสองสาขาในวันเดียวกัน.
 *  - เวลาเหลื่อมกันจริง → `branch_overlap` = ผิดแน่ ต้องแก้ (อยู่สองที่พร้อมกันไม่ได้)
 *  - เวลาไม่ชนกัน → `branch_hop` = เตือน (ต้องวิ่งข้ามสาขาในวันเดียว ตั้งใจหรือเปล่า)
 */
export function findBranchConflicts(cells: PlanCell[], fallbackBranch = "bangkae"): BalanceIssue[] {
  const issues: BalanceIssue[] = [];
  const byPerson = new Map<string, PlanCell[]>();
  for (const cell of cells) {
    if (!isWorkingAssignment(cell.assignment)) continue;
    const key = `${cell.staffCode}__${cell.workDate}`;
    byPerson.set(key, [...(byPerson.get(key) ?? []), cell]);
  }

  for (const [key, dayCells] of byPerson) {
    const branches = [...new Set(dayCells.map((cell) => cellBranch(cell, fallbackBranch)))];
    if (branches.length < 2) continue;
    const [staffCode, workDate] = key.split("__");
    const label = branches.map((branch) => branchShortName(branch)).join(" + ");

    let overlapped = false;
    for (let i = 0; i < dayCells.length && !overlapped; i += 1) {
      for (let j = i + 1; j < dayCells.length; j += 1) {
        if (cellBranch(dayCells[i], fallbackBranch) === cellBranch(dayCells[j], fallbackBranch)) continue;
        const a = cellWindow(dayCells[i], fallbackBranch);
        const b = cellWindow(dayCells[j], fallbackBranch);
        if (a && b && a.start < b.end && b.start < a.end) {
          overlapped = true;
          break;
        }
      }
    }

    issues.push(
      overlapped
        ? {
            kind: "branch_overlap",
            ref: key,
            message: `${workDate} ${staffCode}: ลงกะ ${label} เวลาชนกัน — อยู่สองสาขาพร้อมกันไม่ได้`
          }
        : {
            kind: "branch_hop",
            ref: key,
            message: `${workDate} ${staffCode}: วันเดียวลงทั้ง ${label} — ต้องวิ่งข้ามสาขา เช็คอีกที`
          }
    );
  }
  return issues;
}

/**
 * ทุกวันที่ร้านเปิด ต้องมีคนอยู่จนถึงเวลาปิดร้านของสาขานั้น — ไม่งั้นไม่มีคนปิดร้าน.
 * (กะ 9 ชั่วโมง เข้าเช้าเกินไปจะเลิกก่อนร้านปิด)
 */
export function findUncoveredClosings(cells: PlanCell[], workDates: string[], fallbackBranch = "bangkae"): BalanceIssue[] {
  const issues: BalanceIssue[] = [];
  const branches = [...new Set(cells.map((cell) => cellBranch(cell, fallbackBranch)))];
  for (const date of workDates) {
    for (const branch of branches) {
      const ofDay = cells.filter((cell) => cell.workDate === date && cellBranch(cell, fallbackBranch) === branch);
      const working = ofDay.filter((cell) => isWorkingAssignment(cell.assignment));
      if (working.length === 0) continue;
      const closeAt = minutesOf(branchConfig(branch).closeTime);
      if (closeAt === null) continue;
      const covered = working.some((cell) => {
        const window = cellWindow(cell, fallbackBranch);
        return window ? window.end >= closeAt : false;
      });
      if (!covered) {
        issues.push({
          kind: "no_closer",
          ref: `${date}__${branch}`,
          message: `${date} ${branchShortName(branch)}: ไม่มีใครอยู่ถึงเวลาปิดร้าน ${branchConfig(branch).closeTime}`
        });
      }
    }
  }
  return issues;
}

/** Threshold above which a person's shift mix counts as "stuck on one shift". */
export const SHIFT_IMBALANCE_THRESHOLD = 3;

/** Flags any staff whose s1 vs s2 counts diverge past the threshold. */
export function findShiftImbalances(summaries: StaffSummary[]): BalanceIssue[] {
  return summaries
    .filter((summary) => summary.totalWorkDays > 0 && summary.shiftImbalance > SHIFT_IMBALANCE_THRESHOLD)
    .map((summary) => ({
      kind: "shift_imbalance" as const,
      ref: summary.staffCode,
      message: `${summary.staffCode}: กะ1 ${summary.s1Count} / กะ2 ${summary.s2Count} วัน — ควรสลับให้ใกล้เคียงกัน`
    }));
}

/** All balance issues for a month plan (รวมทุกสาขาที่อยู่ในลิสต์ที่ส่งเข้ามา). */
export function auditPlan(
  cells: PlanCell[],
  workDates: string[],
  staffCodes: string[],
  fallbackBranch = "bangkae"
): BalanceIssue[] {
  const summaries = staffCodes.map((code) => summariseStaff(code, cells));
  return [
    ...findBranchConflicts(cells, fallbackBranch),
    ...findUnderstaffedDays(cells, workDates, fallbackBranch),
    ...findUncoveredClosings(cells, workDates, fallbackBranch),
    ...findShiftImbalances(summaries)
  ];
}
