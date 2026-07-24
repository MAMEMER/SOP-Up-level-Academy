import {
  calculateEmployeePerformanceScore,
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
  id: "previous-half-month" | "july-to-date" | "custom";
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
  sourceType: "google-sheet" | "storehub-csv" | "manual-input";
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

export const performanceReviewPeriods: PerformanceReviewPeriod[] = [
  {
    id: "previous-half-month",
    label: "ครึ่งเดือนที่แล้ว",
    startDate: "2026-06-16",
    endDate: "2026-06-30"
  },
  {
    id: "july-to-date",
    label: "1 ก.ค. 2026 ถึงปัจจุบัน",
    startDate: "2026-07-01",
    endDate: "2026-07-09"
  }
];

export const performanceSourceStatuses: PerformanceSourceStatus[] = [
  { key: "schedule", label: "Google Sheet ตารางกะ", status: "import-ready", detail: "อิงโครงสร้างจริงจาก Sheet ตารางการทำงาน Uplevel (บางแค)" },
  { key: "attendance", label: "StoreHub clock-in", status: "import-ready", detail: "อ่านไฟล์ Timesheets CSV ล่าสุดจากโฟลเดอร์ข้อมูล performance รายเดือน" },
  { key: "stock", label: "StoreHub stock count", status: "import-ready", detail: "อ่านจาก StoreHub Stock Take CSV export และช่อง Difference" },
  { key: "checklist", label: "Checklist", status: "import-ready", detail: "อิงจาก Google Sheet uplevel_daily_checklist tab Form Responses 1" }
];

export const performanceSourceDetails: PerformanceSourceDetail[] = [
  {
    key: "schedule",
    title: "Google Sheet ตารางกะ",
    sourcePath: "https://docs.google.com/spreadsheets/d/1C9iMNfU8PYGoAaUN68M39ihJSOW4ZcYinzYDHBgyDWw/edit",
    sourceType: "google-sheet",
    currentRange: "JUN26. และ JUL26 แถวชื่อพนักงาน + แถวแก้ไข/หมายเหตุ",
    whatToCheck: ["เวลาเข้ากะรายวัน", "OFF", "บรรทัดแก้ไขใช้เป็นข้อมูลล่าสุด", "ลาป่วย/ลากิจในแถวหมายเหตุ", "ยอดวันลาทั้งปีนับเฉพาะวันที่มีกะ"]
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

const sheetScheduleRows: SheetScheduleRow[] = [
  {
    employeeName: "ICE",
    month: "2026-06",
    shifts: {
      16: "11:00",
      17: "11:00",
      18: "13:30",
      19: "11:00",
      20: "OFF",
      21: "OFF",
      22: "13:30",
      23: "13:30",
      24: "13:30",
      25: "13:30",
      26: "13:30",
      27: "09:00",
      28: "OFF",
      29: "11:00",
      30: "13:30"
    }
  },
  {
    employeeName: "Boom",
    month: "2026-06",
    shifts: {
      16: "OFF",
      17: "OFF",
      18: "OFF",
      19: "13:30",
      20: "09:00",
      21: "09:00",
      22: "11:00",
      23: "OFF",
      24: "OFF",
      25: "11:00",
      26: "11:00",
      27: "11:00",
      28: "09:00",
      29: "13:00",
      30: "OFF"
    }
  },
  {
    employeeName: "Leo",
    month: "2026-06",
    shifts: {
      16: "13:30",
      17: "13:30",
      18: "OFF",
      19: "OFF",
      20: "11:30",
      21: "OFF",
      22: "OFF",
      23: "11:00",
      24: "11:00",
      25: "OFF",
      26: "OFF",
      27: "09:00",
      28: "OFF",
      29: "13:00",
      30: "11:00"
    }
  },
  {
    employeeName: "ICE",
    month: "2026-07",
    shifts: { 1: "13:00", 2: "13:00", 3: "11:00", 4: "OFF", 5: "OFF", 6: "13:00", 7: "11:00", 8: "13:00", 9: "13:30" },
    editShifts: { 7: "f", 9: "f" }
  },
  {
    employeeName: "Boom",
    month: "2026-07",
    shifts: { 1: "OFF", 2: "11:00", 3: "11:00", 4: "09:00", 5: "09:00", 6: "13:00", 7: "OFF", 8: "OFF", 9: "11:00" },
    editShifts: { 3: "ลาป่วย", 4: "ลาป่วย", 5: "ลาป่วย", 6: "ลาป่วย", 8: "11" }
  },
  {
    employeeName: "Leo",
    month: "2026-07",
    shifts: { 1: "11:00", 2: "OFF", 3: "13:30", 4: "11:00", 5: "OFF", 6: "OFF", 7: "13:30", 8: "11:00", 9: "OFF" }
  }
];

function addHours(isoDateTime: string, hours: number) {
  return new Date(Date.parse(isoDateTime) + hours * 60 * 60 * 1000).toISOString();
}

function buildSchedules(rows: SheetScheduleRow[]): ShiftSchedule[] {
  return applyScheduleEditRows(rows).flatMap((row) =>
    Object.entries(row.shifts)
      .filter(([, shift]) => shift !== "OFF" && !leaveTypeFromScheduleValue(shift))
      .flatMap(([day, shift]) => {
        const normalizedShiftStart = normalizeShiftStart(shift);
        if (!normalizedShiftStart) return [];
        const workDate = `${row.month}-${day.padStart(2, "0")}`;
        const scheduledStart = `${workDate}T${normalizedShiftStart}:00+07:00`;
        return [{
          employeeName: row.employeeName,
          workDate,
          scheduledStart,
          scheduledEnd: addHours(scheduledStart, 9),
          shiftLabel: `${row.month.toUpperCase()} sheet ${normalizedShiftStart}`,
          source: "google-sheet" as const
        }];
      })
  );
}

const schedules = buildSchedules(sheetScheduleRows);
const leaveEligibleSchedules = buildSchedules(sheetScheduleRows.map((row) => ({ ...row, editShifts: undefined })));

type SheetLeaveRow = {
  employeeName: string;
  month: "2026-06" | "2026-07";
  leaves: Record<number, "sick" | "personal">;
};

const sheetLeaveRows: SheetLeaveRow[] = [
  {
    employeeName: "Boom",
    month: "2026-06",
    leaves: { 24: "sick", 25: "sick", 26: "sick", 27: "sick", 28: "sick", 29: "sick", 30: "sick" }
  },
];

function buildLeaveRecords(rows: SheetLeaveRow[]): LeaveRecord[] {
  const explicitLeaveRecords = rows.flatMap((row) =>
    Object.entries(row.leaves).map(([day, type]) => ({
      employeeName: row.employeeName,
      workDate: `${row.month}-${day.padStart(2, "0")}`,
      type,
      source: "google-sheet" as const
    }))
  );
  const scheduleLeaveRecords = applyScheduleEditRows(sheetScheduleRows).flatMap((row) =>
    Object.entries(row.shifts).flatMap(([day, shift]) => {
      const type = leaveTypeFromScheduleValue(shift);
      if (!type) return [];
      return [{
        employeeName: row.employeeName,
        workDate: `${row.month}-${day.padStart(2, "0")}`,
        type,
        source: "google-sheet" as const
      }];
    })
  );
  const leaveByDay = new Map([...explicitLeaveRecords, ...scheduleLeaveRecords].map((record) => [`${record.employeeName}:${record.workDate}`, record]));
  return [...leaveByDay.values()];
}

const leaveRecords = buildLeaveRecords(sheetLeaveRows);

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

export function missingMorningStockCountRecords(input: {
  employeeName: string;
  schedules: ShiftSchedule[];
  stockCounts: StockCountRecord[];
  leaveRecords?: LeaveRecord[];
}): StockCountRecord[] {
  const leaveDays = new Set((input.leaveRecords || []).map((record) => `${record.employeeName}:${record.workDate}`));
  return input.schedules
    .filter((schedule) => schedule.employeeName === input.employeeName && isMorningShift(schedule))
    .filter((schedule) => !leaveDays.has(`${schedule.employeeName}:${schedule.workDate}`))
    .filter((schedule) => {
      const start = Date.parse(schedule.scheduledStart);
      const end = Date.parse(schedule.scheduledEnd);
      return !input.stockCounts.some((count) => {
        if (count.employeeName !== input.employeeName || !count.startedAt || !count.submittedAt) return false;
        const countedAt = Date.parse(count.startedAt);
        return Number.isFinite(countedAt) && countedAt >= start && countedAt <= end;
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

const missingChecklistDays = [
  { employeeName: "ICE", workDate: "2026-07-02" },
  { employeeName: "ICE", workDate: "2026-07-03" },
  { employeeName: "Leo", workDate: "2026-07-03" },
  { employeeName: "Leo", workDate: "2026-07-04" }
];

export function missingChecklistEventsFromAttendance(input: {
  employeeName: string;
  period: PerformanceReviewPeriod;
  schedules: ShiftSchedule[];
  clockEvents: ClockEvent[];
  missingChecklistDays: { employeeName: string; workDate: string }[];
}): ChecklistEvent[] {
  const scheduledDays = new Set(input.schedules.map((schedule) => `${schedule.employeeName}:${schedule.workDate}`));
  const clockedInDays = new Set(input.clockEvents.map((clock) => `${clock.employeeName}:${clock.workDate}`));
  const dates = input.missingChecklistDays
    .filter((day) => day.employeeName === input.employeeName && inPeriod(day.workDate, input.period))
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

export function getPerformanceScoreRows(periodId: PerformanceReviewPeriod["id"], dailyStore: PerformanceDailyStore): EmployeePerformanceScore[] {
  const period = performanceReviewPeriods.find((item) => item.id === periodId) || performanceReviewPeriods[0];
  return getPerformanceScoreRowsForRange(period, dailyStore);
}

export function getPerformanceScoreRowsForRange(period: PerformanceReviewPeriod, dailyStore: PerformanceDailyStore): EmployeePerformanceScore[] {
  const year = period.startDate.slice(0, 4);
  const serviceEventsFromRecords = customerServiceRecordsToEvents(dailyStore.serviceRecords.filter((record) => inPeriod(record.workDate, period)));
  const assignedWorksFromRecords = assignedWorkRecordsToWorks(dailyStore.assignedWorkRecords.filter((record) => inPeriod(record.workDate, period)), {
    teamAssigneeName: bangkaeTeamAssigneeName,
    teamMembers: employees
  });
  return employees.map((employeeName) => {
    const employeeSchedules = schedules.filter((item) => item.employeeName === employeeName);
    const employeePeriodSchedules = employeeSchedules.filter((item) => inPeriod(item.workDate, period));
    const employeePeriodClockEvents = getClockEventsFromExport().filter((item) => item.employeeName === employeeName && inPeriod(item.workDate, period));
    const employeePeriodStockCounts = annotateSlowMorningCounts({
      employeeName,
      schedules: employeePeriodSchedules,
      stockCounts: getStockCountsFromExport().filter((item) => item.employeeName === employeeName && inPeriod(item.dueDate, period))
    });
    const missingStockCounts = missingMorningStockCountRecords({
      employeeName,
      schedules: employeePeriodSchedules,
      stockCounts: employeePeriodStockCounts,
      leaveRecords: leaveRecords.filter((item) => item.employeeName === employeeName && inPeriod(item.workDate, period))
    });
    const derivedChecklistEvents = missingChecklistEventsFromAttendance({
      employeeName,
      period,
      schedules: employeePeriodSchedules,
      clockEvents: employeePeriodClockEvents,
      missingChecklistDays
    });
    return calculateEmployeePerformanceScore({
      employeeName,
      employmentType: employmentTypeFor(employeeName),
      daysWorked: employeePeriodSchedules.length,
      attendance: {
        schedules: employeePeriodSchedules,
        clockEvents: employeePeriodClockEvents,
        leaveRecords: leaveRecords.filter((item) => item.employeeName === employeeName && inPeriod(item.workDate, period))
      },
      annualLeave: {
        schedules: leaveEligibleSchedules.filter((item) => item.employeeName === employeeName && inYear(item.workDate, year)),
        records: leaveRecords.filter((item) => item.employeeName === employeeName && inYear(item.workDate, year))
      },
      stockCounts: [...employeePeriodStockCounts, ...missingStockCounts],
      checklistEvents: derivedChecklistEvents,
      serviceEvents: serviceEventsFromRecords.filter((item) => item.employeeName === employeeName).map((item) => item.event),
      assignedWorks: assignedWorksFromRecords.filter((item) => item.employeeName === employeeName).map((item) => item.work)
    });
  });
}

export function getPerformanceSummary(rows: EmployeePerformanceScore[]) {
  const teamAverage = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.totalScore, 0) / rows.length) : 0;
  return {
    teamAverage,
    belowSixty: rows.filter((row) => row.totalScore < 60).length,
    unresolvedStockIssues: rows.filter((row) => row.deductions.some((deduction) => deduction.reason === "stock_difference" || deduction.reason === "stock_not_counted")).length,
    missingClockIns: rows.reduce(
      (sum, row) => sum + row.deductions.filter((deduction) => deduction.reason === "late_over_30_minutes_or_missing_clock_in").length,
      0
    )
  };
}
