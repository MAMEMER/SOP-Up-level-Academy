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

/** Shift 1 = opening shift (เปิดร้าน). Shift 2 = closing shift (ปิดร้าน). */
export type ShiftCode = "s1" | "s2";

/** A planned assignment for one staff-day. */
export type ShiftAssignment = "s1" | "s2" | "off" | "leave_personal" | "leave_sick";

export const SHIFT_WORK_HOURS = 9;

/** Allowed entry times per shift (dropdown options). */
export const SHIFT_START_OPTIONS: Record<ShiftCode, string[]> = {
  s1: ["09:00", "11:00"],
  s2: ["11:30", "13:00"]
};

/** The default (first) start time for a shift. */
export function defaultShiftStart(shift: ShiftCode): string {
  return SHIFT_START_OPTIONS[shift][0];
}

/** True when `start` is a valid dropdown option for the given shift. */
export function isValidShiftStart(shift: ShiftCode, start: string): boolean {
  return SHIFT_START_OPTIONS[shift].includes(start);
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
  kind: "understaffed" | "shift_imbalance";
  /** workDate for understaffed, staffCode for shift_imbalance */
  ref: string;
  message: string;
};

export const MIN_STAFF_PER_DAY = 2;

/**
 * Every working day (a day that has at least one assignment) must have at least
 * MIN_STAFF_PER_DAY people on a working shift. Returns one issue per short day.
 */
export function findUnderstaffedDays(cells: PlanCell[], workDates: string[]): BalanceIssue[] {
  const issues: BalanceIssue[] = [];
  for (const date of workDates) {
    const working = cells.filter((cell) => cell.workDate === date && isWorkingAssignment(cell.assignment));
    const anyAssignment = cells.some((cell) => cell.workDate === date && cell.assignment !== "off");
    if (!anyAssignment) continue; // untouched day — don't nag about a blank future date
    if (working.length < MIN_STAFF_PER_DAY) {
      issues.push({
        kind: "understaffed",
        ref: date,
        message: `${date}: มีคนเข้างานแค่ ${working.length} คน (ต้องอย่างน้อย ${MIN_STAFF_PER_DAY})`
      });
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

/** All balance issues for a month plan. */
export function auditPlan(cells: PlanCell[], workDates: string[], staffCodes: string[]): BalanceIssue[] {
  const summaries = staffCodes.map((code) => summariseStaff(code, cells));
  return [...findUnderstaffedDays(cells, workDates), ...findShiftImbalances(summaries)];
}
