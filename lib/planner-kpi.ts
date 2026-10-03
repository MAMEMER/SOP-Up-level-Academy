import type { ClockEvent, LeaveRecord, ShiftSchedule } from "./performance-score.ts";
import type { AttendanceSource } from "./performance-score-data.ts";
import { restListCollection } from "./firestore-rest.ts";
import { defaultShiftStart } from "./shift-schedule.ts";

// Builds the KPI attendance source from the LIVE Firestore planner: the shift plan
// (schedule_shifts) supplies scheduled shifts + planned leave, and schedule_actual
// supplies StoreHub clock-in + any actual leave the owner logged. The employee code
// in the planner (ICE/Boom/Leo) is exactly the KPI employeeName, so no mapping needed.

type ShiftDoc = { branch?: string; workDate?: string; staffCode?: string; assignment?: string; startTime?: string; updatedAt?: string };
type ActualDoc = { branch?: string; workDate?: string; staffCode?: string; clockIn?: string; leaveType?: string; swappedTo?: string };

const isWorking = (assignment?: string) => assignment === "s1" || assignment === "s2";

/** 1 กะต่อคน-วัน: กะทำงานชนะ OFF/ลา, ถ้าทำงานทั้งคู่เชื่อช่องที่แก้ล่าสุด */
export function onePerStaffDay(shifts: ShiftDoc[]): ShiftDoc[] {
  const byKey = new Map<string, ShiftDoc>();
  for (const shift of shifts) {
    if (!shift.workDate || !shift.staffCode) continue;
    const key = `${shift.workDate}__${shift.staffCode}`;
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, shift);
      continue;
    }
    const nextWorks = isWorking(shift.assignment);
    const currentWorks = isWorking(current.assignment);
    if (nextWorks !== currentWorks) {
      if (nextWorks) byKey.set(key, shift);
      continue;
    }
    if ((shift.updatedAt ?? "") > (current.updatedAt ?? "")) byKey.set(key, shift);
  }
  return [...byKey.values()];
}

/** รวม schedule_actual ของทุกสาขาเป็น 1 แถวต่อคน-วัน (ตอกบัตรเช้าสุด, ลา/สลับกะจากแถวไหนก็ได้) */
export function mergeActuals(actuals: ActualDoc[]): ActualDoc[] {
  const byKey = new Map<string, ActualDoc>();
  for (const actual of actuals) {
    if (!actual.workDate || !actual.staffCode) continue;
    const key = `${actual.workDate}__${actual.staffCode}`;
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, { ...actual });
      continue;
    }
    if (actual.clockIn && (!current.clockIn || actual.clockIn < current.clockIn)) current.clockIn = actual.clockIn;
    if (!current.leaveType && actual.leaveType) current.leaveType = actual.leaveType;
    if (!current.swappedTo && actual.swappedTo) current.swappedTo = actual.swappedTo;
  }
  return [...byKey.values()];
}

function addHoursIso(startIso: string, hours: number): string {
  return new Date(Date.parse(startIso) + hours * 3600 * 1000).toISOString();
}

/**
 * KPI เป็นของ "คน" ไม่ใช่ของสาขา — คนที่ไปเข้ากะเสนาเฟสต์ต้องถูกนับเหมือนเข้ากะบางแค.
 * จึงอ่านทุกสาขารวมกัน แล้วยุบให้เหลือ 1 กะต่อคนต่อวัน (ข้อมูลเก่าที่ถูกบันทึกซ้ำสองสาขา
 * เชื่อช่องที่แก้ล่าสุด) และตอกบัตรเอาเวลาเข้าที่เช้าสุดของวันนั้น.
 * `_branch` คงไว้ให้ผู้เรียกเดิมไม่ต้องแก้ — ไม่ได้ใช้กรองแล้ว.
 */
export async function fetchAttendanceSource(_branch?: string): Promise<AttendanceSource> {
  const [allShifts, allActuals] = await Promise.all([
    restListCollection<ShiftDoc>("schedule_shifts"),
    restListCollection<ActualDoc>("schedule_actual")
  ]);
  const shifts = onePerStaffDay(allShifts);
  const actuals = mergeActuals(allActuals);

  const schedules: ShiftSchedule[] = [];
  const clockEvents: ClockEvent[] = [];
  const leaves: LeaveRecord[] = [];
  // Days the person is rostered but scheduled OFF. Lets attendance tell an off-day clock-in
  // (came in / covered a shift) apart from a truly unattributable one (see performance-score).
  const offDays: { employeeName: string; workDate: string }[] = [];

  // Swapped shifts: the original isn't expected to work (someone else covers), so drop
  // their scheduled shift that day = no missing-clock-in penalty.
  const swapped = new Set(
    actuals.filter((a) => a.swappedTo && a.workDate && a.staffCode).map((a) => `${a.workDate}__${a.staffCode}`)
  );

  for (const s of shifts) {
    if (!s.workDate || !s.staffCode) continue;
    if (swapped.has(`${s.workDate}__${s.staffCode}`)) continue;
    if (s.assignment === "s1" || s.assignment === "s2") {
      // ไม่ได้ใส่เวลาเข้า = เวลาแรกของกะนั้นในสาขาที่ลงกะ (เสนาฯ ก2 ≠ 11:30 ของบางแค — ไม่งั้นโดนนับสายผิด)
      const start = s.startTime || defaultShiftStart(s.assignment, s.branch);
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
    } else if (s.assignment === "off") {
      offDays.push({ employeeName: s.staffCode, workDate: s.workDate });
    }
  }

  for (const a of actuals) {
    if (!a.workDate || !a.staffCode) continue;
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

  return { schedules, clockEvents, leaves, annualSchedules, offDays };
}
