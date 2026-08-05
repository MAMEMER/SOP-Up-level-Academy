import {
  calculateEmployeePerformanceScore,
  CHECKLIST_DEDUCTION_START,
  type ChecklistEvent,
  type ClockEvent,
  type EmployeePerformanceScore,
  type LeaveRecord,
  type LeaveType,
  type ShiftSchedule,
  type StockCountRecord
} from "./performance-score.ts";
import {
  assignedWorkRecordsToWorks,
  customerServiceRecordsToEvents,
  type PerformanceDailyStore
} from "./performance-service-records.ts";
import { branchFor, employeeCodes, employmentTypeFor } from "./employee-directory.ts";
import { stockCheckRecordsToCounts } from "./stock-check-records.ts";
import { checklistAuditRecordsToEvents } from "./checklist-audit-records.ts";
import { branchConfig, isSlowMorningCount } from "./store-config.ts";

export type PerformanceReviewPeriod = {
  id: "previous-half-month" | "month-to-date" | "custom";
  label: string;
  startDate: string;
  endDate: string;
};

type PresetPerformanceReviewPeriodId = Exclude<PerformanceReviewPeriod["id"], "custom">;

export type PerformanceSourceStatus = {
  key: string;
  label: string;
  status: "manual" | "import-ready" | "live";
  detail: string;
};

export type PerformanceSourceDetail = {
  key: string;
  title: string;
  sourcePath: string;
  sourceType: "google-sheet" | "manual-input" | "live-planner";
  currentRange: string;
  whatToCheck: string[];
};

const employees = employeeCodes;

// Marks morning stock counts that were done but started past the branch's allowed
// morning window (open time + grace hours) so the Stock KPI can apply the −2 slow penalty.
function annotateSlowMorningCounts(input: {
  employeeName: string;
  schedules: ShiftSchedule[];
  stockCounts: StockCountRecord[];
}): StockCountRecord[] {
  const grace = branchConfig(branchFor(input.employeeName)).stockCountGraceHours;
  const morningShiftByDate = new Map(
    input.schedules.filter(isMorningShift).map((schedule) => [schedule.workDate, schedule])
  );
  return input.stockCounts.map((count) => {
    const shift = morningShiftByDate.get(count.dueDate);
    if (!shift || !count.startedAt) return count;
    const slow = isSlowMorningCount({ scheduledStart: shift.scheduledStart, startedAt: count.startedAt, graceHours: grace });
    return slow ? { ...count, slowCount: true } : count;
  });
}
const bangkaeTeamAssigneeName = "ทีม บางแค";

const thaiMonthNames = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
];

/** today in Asia/Bangkok as YYYY-MM-DD — the store's day, not the server's */
export function bangkokToday(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
  return parts;
}

/**
 * Default KPI window = 1st of the current month → today.
 * This used to be a frozen "2026-07-01 → 2026-07-09" literal, which meant every
 * score on the site silently stopped counting after 9 July.
 */
export function currentReviewPeriod(today = bangkokToday()): PerformanceReviewPeriod {
  const month = Number(today.slice(5, 7));
  return {
    id: "month-to-date",
    label: `1 ${thaiMonthNames[month - 1]} ${today.slice(0, 4)} ถึงปัจจุบัน`,
    startDate: `${today.slice(0, 8)}01`,
    endDate: today
  };
}

/**
 * Payroll runs half-monthly: past the 15th, "ครึ่งเดือนที่แล้ว" is the 1st–15th of
 * this month; on or before the 15th it is the 16th–end of last month.
 */
export function previousHalfMonthPeriod(today = bangkokToday()): PerformanceReviewPeriod {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const day = Number(today.slice(8, 10));
  if (day > 15) {
    const prefix = today.slice(0, 8);
    return { id: "previous-half-month", label: "ครึ่งเดือนที่แล้ว", startDate: `${prefix}01`, endDate: `${prefix}15` };
  }
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prefix = `${prevYear}-${String(prevMonth).padStart(2, "0")}-`;
  const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
  return { id: "previous-half-month", label: "ครึ่งเดือนที่แล้ว", startDate: `${prefix}16`, endDate: `${prefix}${lastDay}` };
}

/** computed per call — a module-level const would freeze on the day the server booted */
export function performanceReviewPeriods(): PerformanceReviewPeriod[] {
  return [previousHalfMonthPeriod(), currentReviewPeriod()];
}

export const performanceSourceStatuses: PerformanceSourceStatus[] = [
  { key: "schedule", label: "ตารางกะบนเว็บ", status: "live", detail: "อ่านจากตารางกะที่วางไว้ในหน้า ตารางกะ (schedule_shifts) — มิ.ย. 2026 นำเข้าจาก Sheet ครั้งเดียว" },
  { key: "attendance", label: "StoreHub clock-in", status: "live", detail: "ดึงจาก StoreHub Timesheets ผ่านปุ่มในหน้าตารางกะ (schedule_actual)" },
  { key: "stock", label: "ผลนับ stock", status: "manual", detail: "เจ้าของร้านกรอกผลการนับในหน้า ลงคะแนน Stock พร้อมแนบรูปจาก StoreHub" },
  { key: "checklist", label: "Checklist", status: "import-ready", detail: "อิงจาก Google Sheet uplevel_daily_checklist tab Form Responses 1" }
];

export const performanceSourceDetails: PerformanceSourceDetail[] = [
  {
    key: "schedule",
    title: "ตารางกะบนเว็บ",
    sourcePath: "/admin/schedule",
    sourceType: "live-planner",
    currentRange: "schedule_shifts — ทุกเดือนที่วางกะไว้ (มิ.ย. 2026 นำเข้าจาก Sheet ครั้งเดียว)",
    whatToCheck: ["เวลาเข้ากะรายวัน", "OFF", "ลาป่วย/ลากิจ", "วันที่สลับกะ", "ยอดวันลาทั้งปีนับเฉพาะวันที่มีกะ"]
  },
  {
    key: "attendance",
    title: "StoreHub clock-in",
    sourcePath: "/admin/schedule",
    sourceType: "live-planner",
    currentRange: "schedule_actual — กดปุ่ม \"ดึง clock-in StoreHub\" ในหน้าตารางกะเพื่ออัปเดตเดือนนั้น",
    whatToCheck: ["ชื่อพนักงานตรงกับที่ตั้งไว้ในหน้าจัดการพนักงาน", "Time In แรกของวัน", "เทียบกับเวลาเข้ากะ", "วันที่ไม่มี clock-in"]
  },
  {
    key: "stock",
    title: "ผลนับ stock",
    sourcePath: "/admin/stock-check",
    sourceType: "manual-input",
    currentRange: "sop_stock_checks — ทุกวันที่เจ้าของกรอกผลการนับไว้",
    whatToCheck: ["ใครรับผิดชอบวันนั้น", "ตรง / ไม่ตรง / ไม่ได้นับ", "นับช้าเกินกรอบ 4 ชม.", "รูปแคปหน้าจอ StoreHub"]
  },
  {
    key: "checklist",
    title: "Checklist",
    sourcePath: "https://docs.google.com/spreadsheets/d/1Ona5H3hBsJywLtRC8FLqyjj7MJTdhwGjhTW3G1X8Fe8/edit?gid=1787889735#gid=1787889735",
    sourceType: "google-sheet",
    currentRange: "Form Responses 1!A:AN, KPI Monthly Scores, 30 Day Dashboard",
    whatToCheck: ["วันที่", "Clock in POS", "งานเปิดร้าน/ปิดร้าน", "หลักฐานงานและโพสต์", "Manager ตรวจ"]
  },
  {
    key: "service",
    title: "Complaint / service",
    sourcePath: "Manual operational input จาก complaint และ feedback",
    sourceType: "manual-input",
    currentRange: ".data/performance-daily-records.json serviceRecords",
    whatToCheck: ["วันที่", "พนักงาน", "ประเภท feedback/event_response", "ระดับเหตุการณ์", "หมายเหตุและหลักฐานที่ทีมตรวจสอบได้"]
  },
  {
    key: "assigned",
    title: "งานที่มอบหมาย",
    sourcePath: "Manual operational input จากงานที่ตกลงร่วมกัน",
    sourceType: "manual-input",
    currentRange: ".data/performance-daily-records.json assignedWorkRecords",
    whatToCheck: ["วันที่บันทึก", "พนักงานหรือทีม", "ชื่องาน", "สถานะงาน", "หมายเหตุและหลักฐานที่ทีมตรวจสอบได้"]
  }
];

export function getPerformanceSourceDetail(sourceKey: string) {
  return performanceSourceDetails.find((source) => source.key === sourceKey);
}

export type SheetScheduleRow = {
  employeeName: string;
  month: "2026-06" | "2026-07";
  shifts: Record<number, string>;
  editShifts?: Record<number, string>;
};

export function leaveTypeFromScheduleValue(value: string): LeaveType | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("ลาป่วย") || normalized === "ป่วย" || normalized === "sick") return "sick";
  if (normalized.includes("ลากิจ") || normalized === "personal") return "personal";
  return undefined;
}

export function applyScheduleEditRows(rows: SheetScheduleRow[]): SheetScheduleRow[] {
  return rows.map((row) => {
    const editEntries = Object.entries(row.editShifts || {}).filter(([, value]) => value.trim().length > 0);
    if (editEntries.length === 0) return row;
    return {
      ...row,
      shifts: {
        ...row.shifts,
        ...Object.fromEntries(editEntries)
      }
    };
  });
}

function normalizeShiftStart(value: string) {
  const normalized = value.trim();
  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2] || "0");
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function isMorningShift(schedule: ShiftSchedule) {
  const hour = Number(schedule.scheduledStart.slice(11, 13));
  return Number.isFinite(hour) && hour < 13;
}

/**
 * A day counts against the Checklist category when the employee was scheduled AND clocked
 * in but no checklist was submitted. `submittedChecklistDays` comes from the real work
 * records (lib/checklist-kpi.ts); `missingChecklistDays` stays supported for callers that
 * already know the missing days directly (and for the tests).
 */
export function missingChecklistEventsFromAttendance(input: {
  employeeName: string;
  period: PerformanceReviewPeriod;
  schedules: ShiftSchedule[];
  clockEvents: ClockEvent[];
  missingChecklistDays?: { employeeName: string; workDate: string }[];
  submittedChecklistDays?: { employeeName: string; workDate: string }[];
  /** หัวข้อ the employee submitted after its own deadline (-2 each) */
  lateChecklistSubmissions?: ChecklistLateSubmission[];
}): ChecklistEvent[] {
  const scheduledDays = new Set(input.schedules.map((schedule) => `${schedule.employeeName}:${schedule.workDate}`));
  const clockedInDays = new Set(input.clockEvents.map((clock) => `${clock.employeeName}:${clock.workDate}`));

  const candidates =
    input.missingChecklistDays ??
    (() => {
      const submitted = new Set(
        (input.submittedChecklistDays || []).map((day) => `${day.employeeName}:${day.workDate}`)
      );
      return input.schedules
        .filter((schedule) => !submitted.has(`${schedule.employeeName}:${schedule.workDate}`))
        .map((schedule) => ({ employeeName: schedule.employeeName, workDate: schedule.workDate }));
    })();

  // A day is only scoreable when the employee was scheduled AND clocked in, within the
  // period, and (for derived days) from go-live onward.
  const scoreable = (day: { employeeName: string; workDate: string }) =>
    day.employeeName === input.employeeName &&
    inPeriod(day.workDate, input.period) &&
    (input.missingChecklistDays ? true : day.workDate >= CHECKLIST_DEDUCTION_START) &&
    scheduledDays.has(`${day.employeeName}:${day.workDate}`) &&
    clockedInDays.has(`${day.employeeName}:${day.workDate}`);

  const missingDates = candidates
    .filter(scoreable)
    .map((day) => day.workDate)
    .sort();
  const missingSet = new Set(missingDates);

  // Submitted-but-late: the หัวข้อ was handed in complete, past its own clock time. Charged
  // per หัวข้อ, not per day — each one has its own deadline now. A day already counted as
  // missing is never also charged as late (nothing was submitted on it at all).
  const late = (input.lateChecklistSubmissions || [])
    .filter(scoreable)
    .filter((item) => !missingSet.has(item.workDate));
  const lateDates = [...new Set(late.map((item) => item.workDate))].sort();

  const events: ChecklistEvent[] = [];
  if (missingDates.length) events.push({ type: "missing_day", count: missingDates.length, dates: missingDates, source: "google-sheet" });
  if (late.length) events.push({ type: "late_submit", count: late.length, dates: lateDates, source: "live" });
  return events;
}

function inPeriod(date: string, period: PerformanceReviewPeriod) {
  return date >= period.startDate && date <= period.endDate;
}

function inYear(date: string, year: string) {
  return date.startsWith(`${year}-`);
}

// Real attendance override sourced from the Firestore planner (shift plan + StoreHub
// clock-in). When provided, it replaces the CSV/sheet fixtures for schedules, clock-in
// and leave — so the KPI attendance score matches the live grid. Stock stays on CSV.
export type AttendanceSource = {
  schedules: ShiftSchedule[];
  clockEvents: ClockEvent[];
  leaves: LeaveRecord[];
  // Schedule set used ONLY for annual leave-allowance eligibility (how many sick/personal
  // days count against the yearly allowance). It must include the days the person was
  // supposed to work, INCLUDING days that turned into leave. In the live planner a PLANNED
  // leave (assignment=leave_sick/leave_personal) produces a leave record but NO work-shift
  // schedule entry, so it would be dropped by scheduledLeaveRecords() — under-counting leave
  // (ticket bP6dfamNSqXQb7TAWVD3: Boom's June sick leave was planned and never counted).
  // fetchAttendanceSource fills this with work shifts + synthetic entries for every leave day.
  annualSchedules?: ShiftSchedule[];
  // Rostered-but-off days (assignment "off"). Used so a StoreHub clock-in on a scheduled day
  // off is labelled as a real "came in on a day off" event instead of "Unmatched clock-in".
  offDays?: { employeeName: string; workDate: string }[];
};

/** หัวข้อ checklist ที่ส่งช้ากว่าเวลาที่กำหนด — 2 คะแนนต่อหัวข้อ */
export type ChecklistLateSubmission = { employeeName: string; workDate: string; phaseId: string };

export function getPerformanceScoreRows(
  periodId: PerformanceReviewPeriod["id"],
  dailyStore: PerformanceDailyStore,
  attendance?: AttendanceSource,
  submittedChecklistDays: { employeeName: string; workDate: string }[] = [],
  lateChecklistSubmissions: ChecklistLateSubmission[] = []
): EmployeePerformanceScore[] {
  const periods = performanceReviewPeriods();
  const period = periods.find((item) => item.id === periodId) || periods[0];
  return getPerformanceScoreRowsForRange(period, dailyStore, attendance, submittedChecklistDays, lateChecklistSubmissions);
}

export function getPerformanceScoreRowsForRange(
  period: PerformanceReviewPeriod,
  dailyStore: PerformanceDailyStore,
  attendance?: AttendanceSource,
  submittedChecklistDays: { employeeName: string; workDate: string }[] = [],
  lateChecklistSubmissions: ChecklistLateSubmission[] = []
): EmployeePerformanceScore[] {
  const year = period.startDate.slice(0, 4);
  // Shifts and leave come from the live planner (schedule_shifts / schedule_actual) only.
  // June 2026 predates the planner and was backfilled into it — see lib/june-2026-backfill.ts.
  const srcSchedules = attendance?.schedules ?? [];
  const srcClock = attendance?.clockEvents ?? [];
  const srcLeaves = attendance?.leaves ?? [];
  const srcAnnualSchedules = attendance?.annualSchedules ?? srcSchedules;
  const srcOffDays = attendance?.offDays ?? [];
  // Stock comes entirely from the owner's entries at /admin/stock-check. A day with no
  // entry is not scored: the KPI no longer derives a "not counted" penalty from the roster,
  // because the owner now states that outcome explicitly (and deriving it as well charged
  // the same miss twice).
  const allStockCounts = stockCheckRecordsToCounts(dailyStore.stockCheckRecords);
  const serviceEventsFromRecords = customerServiceRecordsToEvents(dailyStore.serviceRecords.filter((record) => inPeriod(record.workDate, period)));
  // สุ่มตรวจ checklist — recorded by an admin at /admin/checklist-audit. Adds to the events
  // derived from the submitted records, it does not replace them.
  const checklistAuditEvents = checklistAuditRecordsToEvents(
    (dailyStore.checklistAuditRecords || []).filter((record) => inPeriod(record.workDate, period))
  );
  const assignedWorksFromRecords = assignedWorkRecordsToWorks(dailyStore.assignedWorkRecords.filter((record) => inPeriod(record.workDate, period)), {
    teamAssigneeName: bangkaeTeamAssigneeName,
    teamMembers: employees
  });
  return employees.map((employeeName) => {
    const employeeSchedules = srcSchedules.filter((item) => item.employeeName === employeeName);
    const employeePeriodSchedules = employeeSchedules.filter((item) => inPeriod(item.workDate, period));
    const employeePeriodClockEvents = srcClock.filter((item) => item.employeeName === employeeName && inPeriod(item.workDate, period));
    const employeePeriodStockCounts = annotateSlowMorningCounts({
      employeeName,
      schedules: employeePeriodSchedules,
      stockCounts: allStockCounts.filter((item) => item.employeeName === employeeName && inPeriod(item.dueDate, period))
    });
    const derivedChecklistEvents = missingChecklistEventsFromAttendance({
      employeeName,
      period,
      schedules: employeePeriodSchedules,
      clockEvents: employeePeriodClockEvents,
      submittedChecklistDays,
      lateChecklistSubmissions
    });
    return calculateEmployeePerformanceScore({
      employeeName,
      employmentType: employmentTypeFor(employeeName),
      daysWorked: employeePeriodSchedules.length,
      attendance: {
        schedules: employeePeriodSchedules,
        clockEvents: employeePeriodClockEvents,
        leaveRecords: srcLeaves.filter((item) => item.employeeName === employeeName && inPeriod(item.workDate, period)),
        offDays: srcOffDays.filter((item) => item.employeeName === employeeName && inPeriod(item.workDate, period))
      },
      annualLeave: {
        schedules: srcAnnualSchedules.filter((item) => item.employeeName === employeeName && inYear(item.workDate, year)),
        records: srcLeaves.filter((item) => item.employeeName === employeeName && inYear(item.workDate, year))
      },
      stockCounts: employeePeriodStockCounts,
      checklistEvents: [
        ...derivedChecklistEvents,
        ...checklistAuditEvents.filter((item) => item.employeeName === employeeName).map((item) => item.event)
      ],
      rules: dailyStore.kpiRules,
      adjustments: (dailyStore.scoreAdjustments || [])
        .filter((adjustment) => adjustment.employeeName === employeeName && inPeriod(adjustment.workDate, period))
        .map((adjustment) => ({
          category: adjustment.category,
          points: adjustment.points,
          reason: adjustment.reason,
          workDate: adjustment.workDate
        })),
      serviceEvents: serviceEventsFromRecords.filter((item) => item.employeeName === employeeName).map((item) => item.event),
      assignedWorks: assignedWorksFromRecords.filter((item) => item.employeeName === employeeName).map((item) => item.work)
    });
  });
}

export function getPerformanceSummary(rows: EmployeePerformanceScore[]) {
  // people with no shift in the window would each contribute a free 100 and pull the
  // team average up — count only rows that actually have data behind them
  const scored = rows.filter((row) => row.hasData);
  const teamAverage = scored.length ? Math.round(scored.reduce((sum, row) => sum + row.totalScore, 0) / scored.length) : 0;
  return {
    teamAverage,
    belowSixty: scored.filter((row) => row.totalScore < 60).length,
    unresolvedStockIssues: rows.filter((row) => row.deductions.some((deduction) => deduction.reason === "stock_difference" || deduction.reason === "stock_not_counted")).length,
    missingClockIns: rows.reduce(
      (sum, row) => sum + row.deductions.filter((deduction) => deduction.reason === "late_over_30_minutes_or_missing_clock_in").length,
      0
    )
  };
}
