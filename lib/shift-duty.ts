// Which half of the day's duties (เปิดร้าน = s1 · ปิดร้าน = s2) a staffer actually owns,
// decided from the WHOLE branch-day roster, not only the ก1/ก2 label on their own cell.
//
// Why: the label comes from which dropdown list the planner picked the start time from, and
// those lists are fixed per branch. At บางแค on a weekday the store opens 11:00 but "11:30"
// sits in the ก2 list — so on 2026-11-18 Boom (11:30, earliest in) was stored as ก2 while
// Non (13:00, last out) was also ก2. Boom's checklist showed ปิดร้าน and hid เปิดร้าน.
//
// Rule (same in line-ops-bot lineops/upknow.py effective_assignment):
//   - earliest start of the day at that branch → s1 (opens the store)
//   - latest start → s2 (closes the store)
//   - anyone in between, or a day where everyone starts at the same time → keep the label
// Missing startTime: ก1 counts as earliest, ก2 as latest (the label is all we know).

import type { ShiftAssignment, ShiftCode } from "./shift-schedule.ts";

export type RosterCell = { staffCode?: string; assignment?: ShiftAssignment | string; startTime?: string };

function isShift(value: unknown): value is ShiftCode {
  return value === "s1" || value === "s2";
}

function startKey(cell: RosterCell): string {
  if (cell.startTime && /^\d{2}:\d{2}$/.test(cell.startTime)) return cell.startTime;
  return cell.assignment === "s1" ? "00:00" : "99:99";
}

/** Duty shift for `staffCode` given every plan cell of the same branch and day. */
export function effectiveShift(dayCells: RosterCell[], staffCode: string): ShiftCode | null {
  const me = dayCells.find((cell) => cell.staffCode === staffCode);
  if (!me || !isShift(me.assignment)) return null;
  const starts = dayCells.filter((cell) => isShift(cell.assignment)).map(startKey);
  const earliest = starts.reduce((a, b) => (b < a ? b : a));
  const latest = starts.reduce((a, b) => (b > a ? b : a));
  if (earliest === latest) return me.assignment;
  const mine = startKey(me);
  if (mine === earliest) return "s1";
  if (mine === latest) return "s2";
  return me.assignment;
}

/** staffCode → duty shift for everyone working that branch-day. */
export function effectiveShiftMap(dayCells: RosterCell[]): Map<string, ShiftCode> {
  const out = new Map<string, ShiftCode>();
  for (const cell of dayCells) {
    if (!cell.staffCode) continue;
    const shift = effectiveShift(dayCells, cell.staffCode);
    if (shift) out.set(cell.staffCode, shift);
  }
  return out;
}
