import type { ShiftAssignment } from "./shift-schedule.ts";

// ── One-time backfill: June 2026 shift plan ──────────────────────────────────
//
// June 2026 was worked before the shift planner existed, so the plan only ever lived in
// the Google Sheet "ตารางการทำงาน Uplevel (บางแค)", tab JUN26. This module carries that
// tab in the planner's shape so it can be written into schedule_shifts once. After the
// backfill the KPI reads Firestore, not this file.
//
// The Sheet records a shift as a bare hour, decoded from its own per-day headcount rows:
//   11 → เช้า 11:00–20:00  (s1, opening)
//   13 → บ่าย 13:30–22:30  (s2, closing)
//   blank → OFF
//
// Only 13–30 June is imported. Days 1–12 are all coded "15", which matches neither shift
// row in the Sheet, so importing them would be a guess — they need a decision from the
// owner before they can be scored.

export const JUNE_2026_MONTH = "2026-06";
export const JUNE_2026_BRANCH = "bangkae";

/** exactly as typed in the Sheet: "11", "13", "" for OFF */
type SheetMonth = Record<number, string>;

export const june2026Sheet: Record<string, SheetMonth> = {
  ICE: {
    13: "", 14: "", 15: "11", 16: "11", 17: "11", 18: "11", 19: "11",
    20: "", 21: "", 22: "13", 23: "13", 24: "13", 25: "11", 26: "13",
    27: "13", 28: "", 29: "13", 30: "13"
  },
  Boom: {
    13: "13", 14: "11", 15: "13", 16: "", 17: "", 18: "", 19: "13",
    20: "13", 21: "11", 22: "11", 23: "", 24: "", 25: "", 26: "11",
    27: "11", 28: "11", 29: "11", 30: ""
  },
  Leo: {
    13: "11", 14: "", 15: "", 16: "13", 17: "13", 18: "", 19: "",
    20: "11", 21: "", 22: "", 23: "11", 24: "11", 25: "", 26: "",
    27: "13", 28: "", 29: "", 30: "11"
  }
};

/**
 * Sick leave is not in the JUN26 tab. Boom was signed off for these days — each one is a
 * day the Sheet rosters him and StoreHub has no clock-in, which is what the old KPI
 * fixture recorded too. Marking them as leave means no attendance penalty, and they count
 * against the annual allowance instead.
 */
export const june2026SickLeave: Record<string, number[]> = {
  Boom: [26, 27, 28, 29]
};

export type PlannerShiftDoc = {
  docId: string;
  branch: string;
  month: string;
  workDate: string;
  staffCode: string;
  assignment: ShiftAssignment;
  startTime?: string;
};

const SHIFT_BY_SHEET_CODE: Record<string, { assignment: ShiftAssignment; startTime: string }> = {
  "11": { assignment: "s1", startTime: "11:00" },
  "13": { assignment: "s2", startTime: "13:30" }
};

/** The planner documents this sheet becomes. Deterministic ids, so re-running upserts. */
export function june2026PlannerDocs(): PlannerShiftDoc[] {
  const docs: PlannerShiftDoc[] = [];

  for (const [staffCode, days] of Object.entries(june2026Sheet)) {
    const sickDays = new Set(june2026SickLeave[staffCode] || []);

    for (const [dayKey, code] of Object.entries(days)) {
      const day = Number(dayKey);
      const workDate = `${JUNE_2026_MONTH}-${String(day).padStart(2, "0")}`;
      const shift = SHIFT_BY_SHEET_CODE[code.trim()];

      const { assignment, startTime } = sickDays.has(day)
        ? { assignment: "leave_sick" as ShiftAssignment, startTime: undefined }
        : shift || { assignment: "off" as ShiftAssignment, startTime: undefined };

      docs.push({
        docId: `${JUNE_2026_BRANCH}__${workDate}__${staffCode}`,
        branch: JUNE_2026_BRANCH,
        month: JUNE_2026_MONTH,
        workDate,
        staffCode,
        assignment,
        startTime
      });
    }
  }

  return docs.sort((left, right) => left.docId.localeCompare(right.docId));
}
