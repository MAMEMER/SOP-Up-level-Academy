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
import { existsSync, readFileSync } from "node:fs";
import {
  assignedWorkRecordsToWorks,
  customerServiceRecordsToEvents,
  type PerformanceDailyStore
} from "./performance-service-records.ts";
import { monthlyPerformanceSourceFolder, readPerformanceSourceFiles } from "./performance-source-files.ts";
import { mapStoreHubStockTakeRowsToCounts, parseStoreHubStockTakeCsv } from "./storehub-stocktake-export.ts";
import { firstClockInByEmployeeDate, parseStoreHubTimesheetCsv } from "./storehub-timesheet-export.ts";
import { branchFor, employeeCodes, employmentTypeFor } from "./employee-directory.ts";
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
  sourceType: "google-sheet" | "storehub-csv" | "manual-input" | "live-planner";
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
  { key: "attendance", label: "StoreHub clock-in", status: "import-ready", detail: "อ่านไฟล์ Timesheets CSV ล่าสุดจากโฟลเดอร์ข้อมูล performance รายเดือน" },
  { key: "stock", label: "StoreHub stock count", status: "import-ready", detail: "อ่านจาก StoreHub Stock Take CSV export และช่อง Difference" },
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
    sourcePath: monthlyPerformanceSourceFolder,
    sourceType: "storehub-csv",
    currentRange: "ไฟล์ Timesheets_*.csv ล่าสุดตามเวลาที่ลงไฟล์",
    whatToCheck: ["ชื่อพนักงาน", "Time In แรกของวัน", "เทียบกับเวลาเข้ากะใน Google Sheet", "late/missing clock-in deductions"]
  },
  {
    key: "stock",
    title: "StoreHub stock count",
    sourcePath: monthlyPerformanceSourceFolder,
    sourceType: "storehub-csv",
    currentRange: "ไฟล์ Stock_Take_*.csv ล่าสุดตามเวลาที่ลงไฟล์",
    whatToCheck: ["Start Time", "Completed Time", "Status", "Started By / Completed By", "Expected Qty", "Counted Qty", "Difference"]
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

function getClockEventsFromExport() {
  const sourceFiles = readPerformanceSourceFiles();
  if (!existsSync(sourceFiles.attendanceCsvPath)) return [];
  const csvText = readFileSync(sourceFiles.attendanceCsvPath, "utf8");
  return firstClockInByEmployeeDate(parseStoreHubTimesheetCsv(csvText));
}

function getStockCountsFromExport() {
  const sourceFiles = readPerformanceSourceFiles();
  if (!existsSync(sourceFiles.stockCsvPath)) return [];
  const csvText = readFileSync(sourceFiles.stockCsvPath, "utf8");
  const rows = parseStoreHubStockTakeCsv(csvText);
  return mapStoreHubStockTakeRowsToCounts(rows);
}

function isMorningShift(schedule: ShiftSchedule) {
  const hour = Number(schedule.scheduledStart.slice(11, 13));
  return Number.isFinite(hour) && hour < 13;
}

// The last calendar day the StoreHub stocktake CSV actually contains data for. A day
// after this boundary has NO StoreHub data at all (the CSV simply hasn't been re-exported
// that far), so absence of a count there is NOT evidence of "not counted".
export function stockDataCoverageEnd(stockCounts: StockCountRecord[]): string | undefined {
  let latest: string | undefined;
  for (const count of stockCounts) {
    const date = count.dueDate || count.startedAt?.slice(0, 10) || "";
    if (date && (!latest || date > latest)) latest = date;
  }
  return latest;
}

export function missingMorningStockCountRecords(input: {
  employeeName: string;
  schedules: ShiftSchedule[];
  stockCounts: StockCountRecord[];
  leaveRecords?: LeaveRecord[];
  /**
   * Latest date the StoreHub stocktake data covers (see stockDataCoverageEnd). Morning
   * shifts AFTER this date are not flagged "not counted" — there is no StoreHub data yet,
   * so absence proves nothing. Bugfix (ticket ZDjzavu0t1fhNplxlORR): the KPI was marking
   * ICE "did not count น้ำ,ขนม on 2026-07-27" purely because the loaded CSV export stopped
   * days earlier while the live planner had ICE on a morning shift that day. Pass the GLOBAL
   * coverage end (across all employees' counts) so one person's export gap can't silently
   * zero out everyone. When omitted, coverage is derived from the passed stockCounts, and if
   * there are no counts at all we emit nothing (no data → can't prove a miss).
   */
  coverageEndDate?: string;
}): StockCountRecord[] {
  const leaveDays = new Set((input.leaveRecords || []).map((record) => `${record.employeeName}:${record.workDate}`));
  const coverageEnd = input.coverageEndDate ?? stockDataCoverageEnd(input.stockCounts);
  if (!coverageEnd) return [];
  return input.schedules
    .filter((schedule) => schedule.employeeName === input.employeeName && isMorningShift(schedule))
    .filter((schedule) => schedule.workDate <= coverageEnd)
    .filter((schedule) => !leaveDays.has(`${schedule.employeeName}:${schedule.workDate}`))
    .filter((schedule) => {
      // A morning shift counts as "done" when the employee has ANY StoreHub stock count on
      // the SAME CALENDAR DAY. Bugfix (ticket fxs2huYeIiaFlEW44CHo): the old check matched
      // the count's start time against the shift's exact [start, start+9h] window AND required
      // a Completed status (submittedAt). That produced false "not_counted" penalties when the
      // count was started before the scheduled shift start (e.g. a late/part-time shift while
      // the count is done at store open) or was still "In Progress" — StoreHub clearly shows a
      // count on that day, so the KPI must credit it. A late-started count still gets the −2
      // slowCount penalty via annotateSlowMorningCounts; it just no longer counts as "not counted".
      return !input.stockCounts.some((count) => {
        if (count.employeeName !== input.employeeName || !count.startedAt) return false;
        const countDate = count.dueDate || count.startedAt.slice(0, 10);
        return countDate === schedule.workDate;
      });
    })
    .map((schedule) => ({
      employeeName: input.employeeName,
      owner: input.employeeName,
      category: "น้ำ,ขนม",
      countType: "weekly" as const,
      dueDate: schedule.workDate,
      expectedQuantity: 0,
      actualQuantity: 0,
      discrepancyStatus: "not_counted" as const,
      source: "storehub" as const
    }));
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

  const dates = candidates
    .filter((day) => day.employeeName === input.employeeName && inPeriod(day.workDate, input.period))
    // Nothing before go-live: those days have no records to be missing from.
    .filter((day) => (input.missingChecklistDays ? true : day.workDate >= CHECKLIST_DEDUCTION_START))
    .filter((day) => scheduledDays.has(`${day.employeeName}:${day.workDate}`))
    .filter((day) => clockedInDays.has(`${day.employeeName}:${day.workDate}`))
    .map((day) => day.workDate)
    .sort();

  if (!dates.length) return [];
  return [{ type: "missing_day", count: dates.length, dates, source: "google-sheet" }];
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
};

export function getPerformanceScoreRows(
  periodId: PerformanceReviewPeriod["id"],
  dailyStore: PerformanceDailyStore,
  attendance?: AttendanceSource,
  submittedChecklistDays: { employeeName: string; workDate: string }[] = []
): EmployeePerformanceScore[] {
  const periods = performanceReviewPeriods();
  const period = periods.find((item) => item.id === periodId) || periods[0];
  return getPerformanceScoreRowsForRange(period, dailyStore, attendance, submittedChecklistDays);
}

export function getPerformanceScoreRowsForRange(
  period: PerformanceReviewPeriod,
  dailyStore: PerformanceDailyStore,
  attendance?: AttendanceSource,
  submittedChecklistDays: { employeeName: string; workDate: string }[] = []
): EmployeePerformanceScore[] {
  const year = period.startDate.slice(0, 4);
  // Shifts and leave come from the live planner (schedule_shifts / schedule_actual) only.
  // June 2026 predates the planner and was backfilled into it — see lib/june-2026-backfill.ts.
  const srcSchedules = attendance?.schedules ?? [];
  const srcClock = attendance?.clockEvents ?? getClockEventsFromExport();
  const srcLeaves = attendance?.leaves ?? [];
  const srcAnnualSchedules = attendance?.annualSchedules ?? srcSchedules;
  // Load the stocktake export ONCE and derive the GLOBAL coverage boundary (across all
  // employees) so a "not counted" penalty is only ever raised for days the CSV actually
  // spans. Days beyond it are un-exported, not un-counted (ticket ZDjzavu0t1fhNplxlORR).
  const allStockCounts = getStockCountsFromExport();
  const stockCoverageEnd = stockDataCoverageEnd(allStockCounts);
  const serviceEventsFromRecords = customerServiceRecordsToEvents(dailyStore.serviceRecords.filter((record) => inPeriod(record.workDate, period)));
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
    const missingStockCounts = missingMorningStockCountRecords({
      employeeName,
      schedules: employeePeriodSchedules,
      stockCounts: employeePeriodStockCounts,
      leaveRecords: srcLeaves.filter((item) => item.employeeName === employeeName && inPeriod(item.workDate, period)),
      coverageEndDate: stockCoverageEnd
    });
    const derivedChecklistEvents = missingChecklistEventsFromAttendance({
      employeeName,
      period,
      schedules: employeePeriodSchedules,
      clockEvents: employeePeriodClockEvents,
      submittedChecklistDays
    });
    return calculateEmployeePerformanceScore({
      employeeName,
      employmentType: employmentTypeFor(employeeName),
      daysWorked: employeePeriodSchedules.length,
      attendance: {
        schedules: employeePeriodSchedules,
        clockEvents: employeePeriodClockEvents,
        leaveRecords: srcLeaves.filter((item) => item.employeeName === employeeName && inPeriod(item.workDate, period))
      },
      annualLeave: {
        schedules: srcAnnualSchedules.filter((item) => item.employeeName === employeeName && inYear(item.workDate, year)),
        records: srcLeaves.filter((item) => item.employeeName === employeeName && inYear(item.workDate, year))
      },
      stockCounts: [...employeePeriodStockCounts, ...missingStockCounts],
      checklistEvents: derivedChecklistEvents,
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
