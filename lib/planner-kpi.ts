import type { ClockEvent, LeaveRecord, ShiftSchedule } from "./performance-score.ts";
import type { AttendanceSource } from "./performance-score-data.ts";
import { restListCollection } from "./firestore-rest.ts";

// Builds the KPI attendance source from the LIVE Firestore planner: the shift plan
// (schedule_shifts) supplies scheduled shifts + planned leave, and schedule_actual
// supplies StoreHub clock-in + any actual leave the owner logged. The employee code
// in the planner (ICE/Boom/Leo) is exactly the KPI employeeName, so no mapping needed.

type ShiftDoc = { branch?: string; workDate?: string; staffCode?: string; assignment?: string; startTime?: string };
type ActualDoc = { branch?: string; workDate?: string; staffCode?: string; clockIn?: string; leaveType?: string; swappedTo?: string };

function addHoursIso(startIso: string, hours: number): string {
  return new Date(Date.parse(startIso) + hours * 3600 * 1000).toISOString();
}

export async function fetchAttendanceSource(branch: string): Promise<AttendanceSource> {
  const [shifts, actuals] = await Promise.all([
    restListCollection<ShiftDoc>("schedule_shifts"),
    restListCollection<ActualDoc>("schedule_actual")
  ]);

  const schedules: ShiftSchedule[] = [];
  const clockEvents: ClockEvent[] = [];
  const leaves: LeaveRecord[] = [];

  // Swapped shifts: the original isn't expected to work (someone else covers), so drop
  // their scheduled shift that day = no missing-clock-in penalty.
  const swapped = new Set(
    actuals.filter((a) => a.branch === branch && a.swappedTo && a.workDate && a.staffCode).map((a) => `${a.workDate}__${a.staffCode}`)
  );

  for (const s of shifts) {
    if (s.branch !== branch || !s.workDate || !s.staffCode) continue;
    if (swapped.has(`${s.workDate}__${s.staffCode}`)) continue;
    if (s.assignment === "s1" || s.assignment === "s2") {
      const start = s.startTime || (s.assignment === "s1" ? "09:00" : "11:30");
      const scheduledStart = `${s.workDate}T${start}:00+07:00`;
      schedules.push({
        employeeName: s.staffCode,
        workDate: s.workDate,
        scheduledStart,
        scheduledEnd: addHoursIso(scheduledStart, 9),
        shiftLabel: `live ${start}`,
        source: "live"
      });
    } else if (s.assignment === "leave_personal") {
      leaves.push({ employeeName: s.staffCode, workDate: s.workDate, type: "personal", source: "live" });
    } else if (s.assignment === "leave_sick") {
      leaves.push({ employeeName: s.staffCode, workDate: s.workDate, type: "sick", source: "live" });
    }
  }

  for (const a of actuals) {
    if (a.branch !== branch || !a.workDate || !a.staffCode) continue;
    if (a.clockIn) {
      clockEvents.push({
        employeeName: a.staffCode,
        workDate: a.workDate,
        clockIn: `${a.workDate}T${a.clockIn}:00+07:00`,
        source: "storehub"
      });
    }
    // Actual leave logged on the day overrides the plan for KPI (no attendance penalty).
    if (a.leaveType === "personal" || a.leaveType === "sick") {
      leaves.push({ employeeName: a.staffCode, workDate: a.workDate, type: a.leaveType, source: "live" });
    }
  }

  // Annual leave-allowance eligibility: a leave record only counts against the yearly
  // sick/personal allowance if it fell on a day the person was supposed to work. A PLANNED
  // leave (assignment=leave_sick/leave_personal) has no s1/s2 shift, so it is absent from
  // `schedules` and would otherwise be dropped by scheduledLeaveRecords() — under-counting
  // leave (ticket bP6dfamNSqXQb7TAWVD3). Build a schedule set that also treats every leave
  // day as a scheduled work day. This set is used ONLY for allowance eligibility, never for
  // attendance/missing-clock-in penalties, so a synthetic shift here can't add a false penalty.
  const annualSchedules: ShiftSchedule[] = [...schedules];
  const scheduledDayKeys = new Set(schedules.map((s) => `${s.workDate}__${s.employeeName}`));
  for (const l of leaves) {
    const key = `${l.workDate}__${l.employeeName}`;
    if (scheduledDayKeys.has(key)) continue;
    scheduledDayKeys.add(key);
    const scheduledStart = `${l.workDate}T09:00:00+07:00`;
    annualSchedules.push({
      employeeName: l.employeeName,
      workDate: l.workDate,
      scheduledStart,
      scheduledEnd: addHoursIso(scheduledStart, 9),
      shiftLabel: "leave (allowance-eligibility only)",
      source: "live"
    });
  }

  return { schedules, clockEvents, leaves, annualSchedules };
}
