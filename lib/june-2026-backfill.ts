import type { ShiftAssignment } from "./shift-schedule.ts";

// ── One-time backfill: June 2026 shift plan ──────────────────────────────────
//
// June 2026 was worked before the shift planner existed, so it was transcribed from
// the Google Sheet straight into lib/performance-score-data.ts as a code fixture. That
// fixture is never reached in production (the KPI always passes the LIVE planner
// source), so June has always shown "ไม่มีข้อมูล" on the site.
//
// This module carries that transcription in the planner's own shape so it can be
// written into schedule_shifts once. After the backfill it stays as the record of what
// was imported; the KPI reads Firestore, not this file.
//
// Times are the Sheet's entry times. s1 = opening shift, s2 = closing shift; the split
// follows the planner (s1 starts before 11:30, s2 at 11:30 or later).

export const JUNE_2026_MONTH = "2026-06";
export const JUNE_2026_BRANCH = "bangkae";

type SheetMonth = Record<number, string>;

/** As transcribed from the Sheet: entry time, "OFF", or a Thai leave label. */
export const june2026Sheet: Record<string, SheetMonth> = {
  ICE: {
    16: "11:00", 17: "11:00", 18: "13:30", 19: "11:00", 20: "OFF",
    21: "OFF", 22: "13:30", 23: "13:30", 24: "13:30", 25: "13:30",
    26: "13:30", 27: "09:00", 28: "OFF", 29: "11:00", 30: "13:30"
  },
  Boom: {
    16: "OFF", 17: "OFF", 18: "OFF", 19: "13:30", 20: "09:00",
    21: "09:00", 22: "11:00", 23: "OFF", 24: "OFF", 25: "ลาป่วย",
    26: "ลาป่วย", 27: "ลาป่วย", 28: "ลาป่วย", 29: "ลาป่วย", 30: "OFF"
  },
  Leo: {
    16: "13:30", 17: "13:30", 18: "OFF", 19: "OFF", 20: "11:30",
    21: "OFF", 22: "OFF", 23: "11:00", 24: "11:00", 25: "OFF",
    26: "OFF", 27: "09:00", 28: "OFF", 29: "13:00", 30: "11:00"
  }
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

function assignmentFor(value: string): { assignment: ShiftAssignment; startTime?: string } {
  const raw = value.trim();
  if (raw === "OFF") return { assignment: "off" };
  if (raw.includes("ลาป่วย")) return { assignment: "leave_sick" };
  if (raw.includes("ลากิจ")) return { assignment: "leave_personal" };

  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return { assignment: "off" };
  const startTime = `${match[1].padStart(2, "0")}:${match[2]}`;
  // s1 opens the store, s2 closes it — the planner splits at 11:30.
  return { assignment: startTime < "11:30" ? "s1" : "s2", startTime };
}

/** The planner documents this sheet becomes. Deterministic ids, so re-running upserts. */
export function june2026PlannerDocs(): PlannerShiftDoc[] {
  const docs: PlannerShiftDoc[] = [];
  for (const [staffCode, days] of Object.entries(june2026Sheet)) {
    for (const [day, value] of Object.entries(days)) {
      const workDate = `${JUNE_2026_MONTH}-${day.padStart(2, "0")}`;
      const { assignment, startTime } = assignmentFor(value);
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
