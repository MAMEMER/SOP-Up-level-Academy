import type { AttendanceSource } from "../../lib/performance-score-data.ts";

// Boom's sick leave across the 2026 June/July boundary, in the shape the LIVE planner
// produces. This used to be read from a schedule transcribed into
// lib/performance-score-data.ts; that transcription has been backfilled into the planner
// (lib/june-2026-backfill.ts) and removed from production code, so the expectations that
// depend on it now carry their own input.
//
// The point under test: a sick day only counts against the annual allowance if the person
// was rostered that day. Boom was signed off 24–30 June but only rostered 25–29, and
// 3–6 July out of a 1–9 July roster.

const SICK_DAYS = ["2026-06-25", "2026-06-26", "2026-06-27", "2026-06-28", "2026-06-29", "2026-07-03", "2026-07-04", "2026-07-05", "2026-07-06"];

/** days Boom was rostered but NOT sick — they must not add to the allowance */
const WORKED_DAYS = ["2026-06-19", "2026-06-20", "2026-06-21", "2026-06-22", "2026-07-02", "2026-07-09"];

function shift(workDate: string, shiftLabel: string) {
  const scheduledStart = `${workDate}T09:00:00+07:00`;
  return {
    employeeName: "Boom",
    workDate,
    scheduledStart,
    scheduledEnd: new Date(Date.parse(scheduledStart) + 9 * 3600 * 1000).toISOString(),
    shiftLabel,
    source: "live" as const
  };
}

export const boomSickLeaveAttendance: AttendanceSource = {
  // A planned leave has no work shift, so the sick days are absent from `schedules`…
  schedules: WORKED_DAYS.map((workDate) => shift(workDate, "live 09:00")),
  clockEvents: WORKED_DAYS.map((workDate) => ({
    employeeName: "Boom",
    workDate,
    clockIn: `${workDate}T09:00:00+07:00`,
    source: "storehub" as const
  })),
  leaves: SICK_DAYS.map((workDate) => ({
    employeeName: "Boom",
    workDate,
    type: "sick" as const,
    source: "live" as const
  })),
  // …but they are rostered days for allowance purposes, so they appear here.
  annualSchedules: [
    ...WORKED_DAYS.map((workDate) => shift(workDate, "live 09:00")),
    ...SICK_DAYS.map((workDate) => shift(workDate, "leave (allowance-eligibility only)"))
  ]
};
