import { defaultKpiRules, type KpiRules } from "./kpi-rules.ts";

export type DataSource = "google-sheet" | "storehub" | "manual" | "mock" | "import" | "live";

export type ScoreCategoryKey = "attendance" | "stock" | "checklist" | "customer_service" | "assigned_work";

export type DeductionRecord = {
  category: ScoreCategoryKey;
  points: number;
  reason: string;
  detail: string;
  source: DataSource;
};

export type ScoreResult = {
  score: number;
  maxScore: number;
  deductions: DeductionRecord[];
  flags: string[];
  warnings: string[];
};

export type ShiftSchedule = {
  employeeName: string;
  workDate: string;
  scheduledStart: string;
  scheduledEnd: string;
  shiftLabel: string;
  source: DataSource;
};

export type ClockEvent = {
  employeeName: string;
  workDate: string;
  clockIn: string;
  clockOut?: string;
  source: DataSource;
};

export type AttendanceInput = {
  schedules: ShiftSchedule[];
  clockEvents: ClockEvent[];
  leaveRecords?: LeaveRecord[];
  /**
   * Days the person IS on the roster but is NOT scheduled to work (assignment "off").
   * A StoreHub clock-in on one of these days is a real, attributable event — someone
   * came in on their day off (usually covering a shift) — NOT an unmatched/unknown
   * clock-in. Without this the attendance scorer can't tell an off-day clock-in apart
   * from a clock-in by a code that isn't on the roster at all, and mislabels both as
   * "Unmatched StoreHub clock-in" (ticket HodsWVdPj0tdfNQvoWIV — UP-003 on 2026-08-01).
   */
  offDays?: { employeeName: string; workDate: string }[];
};

export type LeaveType = "sick" | "personal";

export type LeaveRecord = {
  employeeName: string;
  workDate: string;
  type: LeaveType;
  source: DataSource;
};

export type LeaveSummary = {
  sickUsed: number;
  sickAllowance: number;
  sickRemaining: number;
  personalUsed: number;
  personalAllowance: number;
  personalRemaining: number;
  records: LeaveRecord[];
};

export type StockCountRecord = {
  employeeName: string;
  owner: string;
  category: string;
  countType: "weekly" | "monthly";
  dueDate: string;
  startedAt?: string;
  submittedAt?: string;
  expectedQuantity: number;
  actualQuantity: number;
  discrepancyStatus: "matched" | "resolved" | "real_loss" | "fraud_review" | "not_counted";
  resolvedWithin24Hours?: boolean;
  realLossOccurrence?: number;
  /** true when a morning count started after store open / outside the 4h shift window */
  slowCount?: boolean;
  source: DataSource;
};

// KPI rule (21 Jul 2026): StoreHub stock counts are unstable during July 2026, so real
// stock +/- (loss) deductions only start counting from this date onward.
export const STOCK_DIFFERENCE_DEDUCTION_START = "2026-08-01";

// The checklist only started recording to the server on this date. Days before it have no
// records at all, so counting them as "missing_day" would wipe every score (and, via the
// salary rule, deduct real money) for work that was done but never captured.
export const CHECKLIST_DEDUCTION_START = "2026-08-01";

export type ChecklistEvent = {
  type: "missing_day" | "missing_important" | "late_submit" | "backfilled" | "false_record";
  count: number;
  source: DataSource;
  dates?: string[];
  /** human-readable subject for the deduction detail (item name / phase / วันปิดร้าน) */
  label?: string;
};

export type ServiceEvent = {
  bucket: "feedback" | "event_response";
  severity: "fixed_immediately" | "repeated" | "severe";
  count: number;
  source: DataSource;
};

export type AssignedWork = {
  title: string;
  status: "early_quality" | "on_time" | "needs_revision" | "late_one_day" | "not_finished";
  source: DataSource;
};

export type IncentiveTier = {
  label: string;
  /** ได้ incentive กี่ % ของเต็ม — ตั้งได้ที่ /admin/kpi-rules */
  percent: number;
  requiresCoaching: boolean;
};

export type EmploymentType = "full_time" | "part_time";

export type SalaryDeduction = {
  amount: number;
  employmentType: EmploymentType;
  /** whole points below 50 (Math.ceil of 50 - score), 0 when score >= 50 */
  pointsShort: number;
  basis: string;
};

export type EmployeePerformanceInput = {
  employeeName: string;
  attendance: AttendanceInput;
  annualLeave?: {
    schedules: ShiftSchedule[];
    records: LeaveRecord[];
  };
  stockCounts: StockCountRecord[];
  checklistEvents: ChecklistEvent[];
  serviceEvents: ServiceEvent[];
  assignedWorks: AssignedWork[];
  employmentType?: EmploymentType;
  /** scheduled work days in the month, used for part-time salary deduction */
  daysWorked?: number;
  /** evaluation time (ms). Shifts starting after this are not yet scored for attendance. */
  now?: number;
  /** the scoring rulebook — owner-tuned values from /admin/kpi-rules, defaults otherwise */
  rules?: KpiRules;
  /**
   * Owner corrections in points (+ คืน / − หักเพิ่ม) with a reason each. Applied to the
   * total after the five categories are computed — see lib/score-adjustments.ts.
   */
  adjustments?: Array<{ category: ScoreCategoryKey; points: number; reason: string; workDate: string }>;
};

export type EmployeePerformanceScore = {
  employeeName: string;
  totalScore: number;
  /**
   * false when this person has no scheduled day in the window at all (new hire, or
   * a month they did not work). Without it they score a clean 100/100 and land in
   * the top incentive tier for a period they were never on the roster.
   */
  hasData: boolean;
  incentive: IncentiveTier;
  /** net points the owner added (+) or removed (−) by hand, already in totalScore */
  adjustmentPoints: number;
  categories: {
    attendance: ScoreResult;
    stock: ScoreResult;
    checklist: ScoreResult;
    customerService: ScoreResult;
    assignedWork: ScoreResult;
  };
  deductions: DeductionRecord[];
  flags: string[];
  warnings: string[];
  leaveSummary: LeaveSummary;
  salaryDeduction: SalaryDeduction;
};

function clampScore(score: number, maxScore: number) {
  return Math.min(maxScore, Math.max(0, Math.round(score * 100) / 100));
}

// KPI 23 Jul 2026: "ทุกหมวดหักได้เรื่อยๆ" — a category is NOT floored at 0. A category
// with deductions beyond its 20-point capacity goes negative and drags the total down
// (heavier salary impact). Upper-capped at 20 (can't earn above the category max),
// rounded to 2 decimals. The TOTAL is still floored at [0,100] (see clampScore).
function categoryScore(totalDeduction: number, categoryMax: number = defaultKpiRules.categoryMax) {
  return Math.min(categoryMax, Math.round((categoryMax - totalDeduction) * 100) / 100);
}

function dateKey(employeeName: string, workDate: string) {
  return `${employeeName.trim().toLowerCase()}:${workDate}`;
}

function minutesLate(scheduledStart: string, clockIn: string) {
  return Math.max(0, Math.floor((Date.parse(clockIn) - Date.parse(scheduledStart)) / 60_000));
}

/**
 * One leave day per person per date.
 *
 * The live planner reports a leave twice when it is both PLANNED (schedule_shifts
 * assignment=leave_sick) and LOGGED on the day (schedule_actual leaveType) — which is the
 * normal case for an absence that was known in advance. Counting the array straight
 * charged those days to the annual allowance twice: Boom's June/July sick leave showed
 * 14 days against 10 actual days off.
 *
 * Later records win, so a leave logged on the day overrides what was planned.
 */
function uniqueLeaveDays(records: LeaveRecord[]): LeaveRecord[] {
  const byDay = new Map(records.map((record) => [`${record.employeeName.trim().toLowerCase()}:${record.workDate}`, record]));
  return [...byDay.values()].sort((left, right) => left.workDate.localeCompare(right.workDate));
}

export function summarizeLeave(input: LeaveRecord[], rules: KpiRules = defaultKpiRules): LeaveSummary {
  const records = uniqueLeaveDays(input);
  const sickUsed = records.filter((record) => record.type === "sick").length;
  const personalUsed = records.filter((record) => record.type === "personal").length;
  return {
    sickUsed,
    sickAllowance: rules.leave.sickAllowance,
    sickRemaining: Math.max(0, rules.leave.sickAllowance - sickUsed),
    personalUsed,
    personalAllowance: rules.leave.personalAllowance,
    personalRemaining: Math.max(0, rules.leave.personalAllowance - personalUsed),
    records
  };
}

function scheduledLeaveRecords(records: LeaveRecord[], schedules: ShiftSchedule[]) {
  const scheduledWorkDays = new Set(schedules.map((schedule) => dateKey(schedule.employeeName, schedule.workDate)));
  return records.filter((record) => scheduledWorkDays.has(dateKey(record.employeeName, record.workDate)));
}

// ticket OklOUlQlGcwFW0Ikvijk (4 Aug 2026): a shift that has not started yet was being
// docked -2 for a "missing clock-in" while the employee had simply not reached เวลาเข้างาน.
// Attendance is only knowable once the shift has actually begun, so `now` gates the
// no-clock (and late) evaluation: a schedule whose scheduledStart is still in the future is
// left unscored until it starts. Historical days (scheduledStart < now) are unaffected.
export function calculateAttendanceScore(input: AttendanceInput, now: number = Date.now(), rules: KpiRules = defaultKpiRules): ScoreResult {
  const deductions: DeductionRecord[] = [];
  const warnings: string[] = [];
  const clocks = new Map(input.clockEvents.map((event) => [dateKey(event.employeeName, event.workDate), event]));
  const schedules = new Set(input.schedules.map((schedule) => dateKey(schedule.employeeName, schedule.workDate)));
  const approvedLeave = new Set((input.leaveRecords || []).map((record) => dateKey(record.employeeName, record.workDate)));
  const offDays = new Set((input.offDays || []).map((off) => dateKey(off.employeeName, off.workDate)));

  input.schedules.forEach((schedule) => {
    if (approvedLeave.has(dateKey(schedule.employeeName, schedule.workDate))) return;

    // Shift not started yet → cannot be late or absent. Skip until scheduledStart passes.
    // (Unparseable scheduledStart → NaN comparison is false → falls through to old behavior.)
    const startsAt = Date.parse(schedule.scheduledStart);
    if (startsAt > now) return;

    const clock = clocks.get(dateKey(schedule.employeeName, schedule.workDate));
    if (!clock) {
      deductions.push({
        category: "attendance",
        points: rules.attendance.missingClockIn,
        reason: "late_over_30_minutes_or_missing_clock_in",
        detail: `${schedule.employeeName} missing clock-in or late over 30 minutes on ${schedule.workDate}`,
        source: schedule.source
      });
      return;
    }

    const lateMinutes = minutesLate(schedule.scheduledStart, clock.clockIn);
    if (lateMinutes > rules.attendance.lateGraceMinutes) {
      deductions.push({
        category: "attendance",
        points: rules.attendance.lateOver10Minutes,
        reason: "late_over_10_minutes",
        detail: `${schedule.employeeName} late ${lateMinutes} minutes on ${schedule.workDate}`,
        source: clock.source
      });
    } else if (lateMinutes > 0) {
      deductions.push({
        category: "attendance",
        points: rules.attendance.lateWithin10Minutes,
        reason: "late_within_10_minutes",
        detail: `${schedule.employeeName} late ${lateMinutes} minutes on ${schedule.workDate}`,
        source: clock.source
      });
    }
  });

  input.clockEvents.forEach((clock) => {
    const key = dateKey(clock.employeeName, clock.workDate);
    if (approvedLeave.has(key)) return;
    if (schedules.has(key)) return; // matched a scheduled working shift → already scored above

    // Clocked in on a day the person is rostered but scheduled OFF: a real event (came in
    // on a day off / covered a shift), not a data error. Surface it clearly so the admin can
    // decide whether it should count, instead of the alarming "Unmatched ... clock-in".
    if (offDays.has(key)) {
      warnings.push(`${clock.employeeName} ลงเวลาเข้างานวันที่ ${clock.workDate} ทั้งที่เป็นวันหยุด (อาจมาแทนกะ — ตรวจสอบ/ปรับกะถ้าถูกต้อง)`);
      return;
    }

    // Clock-in for a code with no roster presence that day at all → genuine data problem
    // (e.g. a stale StoreHub code that no longer maps to anyone on the shift plan).
    warnings.push(`Unmatched StoreHub clock-in for ${clock.employeeName} on ${clock.workDate}`);
  });

  const totalDeduction = deductions.reduce((sum, deduction) => sum + deduction.points, 0);
  return { score: categoryScore(totalDeduction, rules.categoryMax), maxScore: rules.categoryMax, deductions, flags: [], warnings };
}

export function calculateStockScore(records: StockCountRecord[], rules: KpiRules = defaultKpiRules): ScoreResult {
  const deductions: DeductionRecord[] = [];
  const flags: string[] = [];
  const warnings: string[] = [];

  // not_counted is occurrence-based: first 2 missed counts cost 10 each, then 5 each.
  // Sort by dueDate so occurrence order is deterministic regardless of input order.
  const orderedRecords = [...records].sort((left, right) => left.dueDate.localeCompare(right.dueDate));
  let notCountedOccurrence = 0;

  orderedRecords.forEach((record) => {
    if (record.discrepancyStatus === "not_counted") {
      notCountedOccurrence += 1;
      const points = notCountedOccurrence <= rules.stock.notCountedEscalateAfter ? rules.stock.notCountedFirst : rules.stock.notCountedAfter;
      deductions.push({
        category: "stock",
        points,
        reason: "stock_not_counted",
        detail: `${record.employeeName} did not count ${record.category} on ${record.dueDate} (ครั้งที่ ${notCountedOccurrence})`,
        source: record.source
      });
      return;
    }

    // Slow morning count (started after store open / outside the 4h shift window): -2.
    if (record.slowCount) {
      deductions.push({
        category: "stock",
        points: rules.stock.slowCount,
        reason: "stock_slow_count",
        detail: `${record.employeeName} นับ stock ช้าเกินกรอบ 4 ชม. ${record.category} on ${record.dueDate}`,
        source: record.source
      });
    }

    if (record.discrepancyStatus === "resolved" && record.resolvedWithin24Hours) return;

    if (record.discrepancyStatus === "real_loss") {
      // July 2026 grace: StoreHub unstable, so real +/- is only flagged (warning), not deducted,
      // until STOCK_DIFFERENCE_DEDUCTION_START.
      if (record.dueDate < STOCK_DIFFERENCE_DEDUCTION_START) {
        warnings.push(`${record.category} มี StoreHub Difference on ${record.dueDate} (ยังไม่หักช่วง July 2026)`);
      } else {
        deductions.push({
          category: "stock",
          points: rules.stock.realLoss,
          reason: "stock_difference",
          detail: `${record.category} has StoreHub Difference`,
          source: record.source
        });
      }
    }

    if (record.discrepancyStatus === "fraud_review") flags.push("management_review_required");
  });

  const totalDeduction = deductions.reduce((sum, deduction) => sum + deduction.points, 0);
  return { score: categoryScore(totalDeduction, rules.categoryMax), maxScore: rules.categoryMax, deductions, flags: [...new Set(flags)], warnings };
}

export function calculateChecklistScore(events: ChecklistEvent[], rules: KpiRules = defaultKpiRules): ScoreResult {
  const deductions: DeductionRecord[] = [];
  const flags: string[] = [];

  // KPI checklist (started 4 Aug 2026) — เริ่มที่ 20 คะแนน/เดือน, หักตามเหตุการณ์:
  //  - missing_day (ขาด checklist ทั้งวัน): escalate เหมือน stock — ครั้งที่ 1-2 หัก 10, ครั้งที่ 3+ หัก 5.
  //    (submit ครบทุก phase = ไม่มี event นี้ = ไม่หัก). "ไม่มีงานนั้น" ที่พนักงานติ๊กถือว่าครบ ไม่ขาด
  //    (กรองที่ชั้น data ก่อนสร้าง event).
  //  - missing_important (ขาด item สำคัญ เช่น จัดส่งสินค้า/แจ้งเลข tracking): -1 ต่อข้อ.
  //  - late_submit (ส่งหัวข้อนั้นช้ากว่าเวลาที่กำหนด แต่ยังในวันเดียวกัน): -1 ต่อหัวข้อ.
  //  - false_record (audit แล้วข้อมูลไม่ตรงจริง): -10 ต่อครั้ง + flag coaching_required.
  //  - backfilled (ส่งย้อนหลัง): 0 — ไม่หัก.
  // คะแนนหมวดไม่ floor ที่ 0 (categoryScore) — หักไปเรื่อยๆ ติดลบได้.
  // Occurrence order สำหรับ missing_day เป็นแบบ deterministic: เรียงตามวันที่เก่าสุดก่อน.
  const missingDayEvents = events
    .filter((event) => event.type === "missing_day")
    .sort((left, right) => (left.dates?.[0] ?? "").localeCompare(right.dates?.[0] ?? ""));
  let missingOccurrence = 0;
  missingDayEvents.forEach((event) => {
    let points = 0;
    const occurrences: number[] = [];
    for (let i = 0; i < event.count; i += 1) {
      missingOccurrence += 1;
      occurrences.push(missingOccurrence);
      points += missingOccurrence <= rules.checklist.missingDayEscalateAfter ? rules.checklist.missingDayFirst : rules.checklist.missingDayAfter;
    }
    const dateDetail = event.dates?.length ? `: ${event.dates.join(", ")}` : "";
    const occLabel = occurrences.length === 1 ? `ครั้งที่ ${occurrences[0]}` : `ครั้งที่ ${occurrences[0]}-${occurrences[occurrences.length - 1]}`;
    deductions.push({
      category: "checklist",
      points,
      reason: "missing_day",
      detail: `ขาด checklist ทั้งวัน ${occLabel}${dateDetail}`,
      source: event.source
    });
  });

  events
    .filter((event) => event.type !== "missing_day")
    .forEach((event) => {
      type OtherType = Exclude<ChecklistEvent["type"], "missing_day">;
      const pointsByType = {
        missing_important: rules.checklist.missingImportant,
        late_submit: rules.checklist.lateSubmit,
        backfilled: rules.checklist.backfilled,
        false_record: rules.checklist.falseRecord
      } satisfies Record<OtherType, number>;
      const subject = event.label ?? event.dates?.join(", ");
      const detailByType = {
        missing_important: `ขาด item สำคัญ${subject ? `: ${subject}` : ` x ${event.count}`}`,
        late_submit: `ส่ง checklist ช้ากว่าเวลาที่กำหนด x ${event.count} หัวข้อ${subject ? ` (${subject})` : ""}`,
        backfilled: `ส่ง checklist ย้อนหลัง x ${event.count}`,
        false_record: `ข้อมูล checklist ไม่ตรงจริง${subject ? `: ${subject}` : ` x ${event.count}`}`
      } satisfies Record<OtherType, string>;
      deductions.push({
        category: "checklist",
        points: pointsByType[event.type as OtherType] * event.count,
        reason: event.type,
        detail: detailByType[event.type as OtherType],
        source: event.source
      });
      if (event.type === "false_record") flags.push("coaching_required");
    });

  const totalDeduction = deductions.reduce((sum, deduction) => sum + deduction.points, 0);
  return { score: categoryScore(totalDeduction, rules.categoryMax), maxScore: rules.categoryMax, deductions, flags: [...new Set(flags)], warnings: [] };
}

export function calculateCustomerServiceScore(events: ServiceEvent[], rules: KpiRules = defaultKpiRules): ScoreResult {
  // KPI 23 Jul 2026: pure deduction model (no per-bucket floor, category can go negative).
  // First complaint / fixed on the spot = -5 each. Repeat of the same issue = -10 + coach.
  // Severe complaint = -10 + coach. Applies to both the feedback and event-response buckets.
  const deductions: DeductionRecord[] = [];
  const flags: string[] = [];

  events.forEach((event) => {
    let points: number;
    if (event.severity === "severe" || event.severity === "repeated") {
      points = rules.customerService.repeatedOrSevere * event.count;
      flags.push("coaching_required");
    } else {
      points = rules.customerService.fixedImmediately * event.count;
    }
    deductions.push({
      category: "customer_service",
      points,
      reason: `${event.bucket}_${event.severity}`,
      detail: `${event.bucket} ${event.severity} x ${event.count}`,
      source: event.source
    });
  });

  const totalDeduction = deductions.reduce((sum, deduction) => sum + deduction.points, 0);
  return { score: categoryScore(totalDeduction, rules.categoryMax), maxScore: rules.categoryMax, deductions, flags: [...new Set(flags)], warnings: [] };
}

// KPI 3 Aug 2026 (ticket 6D3HIfy7): assigned work scored by cumulative deductions from 20.
// The three "approved / got the points" outcomes cost nothing — owner approval is what
// credits the point, and it does not have to happen the same day (only the submission must
// beat the deadline):
//   - early_quality  เสร็จก่อนกำหนดพร้อมคุณภาพ (owner approved)   -> 0
//   - on_time        เสร็จตรงเวลา (owner approved)                 -> 0
//   - needs_revision เสร็จแต่ต้องแก้ไข แล้ว owner approved         -> 0
// Only late / unfinished submissions are docked:
//   - late_one_day   ส่งช้ากว่ากำหนดไม่เกิน 1 วัน                  -> -1
//   - not_finished   ไม่เสร็จ / เกินกำหนด (auto if unsubmitted past deadline) -> -5 + coach
function assignedWorkItemDeduction(status: AssignedWork["status"], rules: KpiRules) {
  if (status === "late_one_day") return rules.assignedWork.lateOneDay;
  if (status === "not_finished") return rules.assignedWork.notFinished;
  return 0;
}

export function calculateAssignedWorkScore(works: AssignedWork[], rules: KpiRules = defaultKpiRules): ScoreResult {
  if (works.length === 0) return { score: rules.categoryMax, maxScore: rules.categoryMax, deductions: [], flags: [], warnings: [] };

  const flags: string[] = [];
  const deductions: DeductionRecord[] = [];
  works.forEach((work) => {
    if (work.status === "not_finished") flags.push("coaching_required");
    const points = assignedWorkItemDeduction(work.status, rules);
    if (points > 0) {
      deductions.push({
        category: "assigned_work",
        points,
        reason: work.status,
        detail: work.title,
        source: work.source
      });
    }
  });

  const totalDeduction = deductions.reduce((sum, item) => sum + item.points, 0);
  return { score: categoryScore(totalDeduction, rules.categoryMax), maxScore: rules.categoryMax, deductions, flags: [...new Set(flags)], warnings: [] };
}

export function getIncentiveTier(totalScore: number, rules: KpiRules = defaultKpiRules): IncentiveTier {
  const tiers = [...rules.incentive.tiers].sort((left, right) => right.min - left.min);
  const tier = tiers.find((item) => totalScore >= item.min) || tiers[tiers.length - 1];
  return { label: tier.label, percent: tier.percent, requiresCoaching: tier.percent === 0 };
}

// KPI 21 Jul 2026: below 50 total, salary is docked. Full time = whole points short × 500.
// Part time = points-short percent of the month's earnings (daysWorked × dailyRate). Rounds up.
export function calculateSalaryDeduction(
  totalScore: number,
  opts?: { employmentType?: EmploymentType; daysWorked?: number; dailyRate?: number; fullTimeRatePerPoint?: number; threshold?: number }
): SalaryDeduction {
  const employmentType = opts?.employmentType ?? "full_time";
  const dailyRate = opts?.dailyRate ?? defaultKpiRules.salary.partTimeDailyRate;
  const fullTimeRatePerPoint = opts?.fullTimeRatePerPoint ?? defaultKpiRules.salary.fullTimeRatePerPoint;
  const threshold = opts?.threshold ?? defaultKpiRules.salary.threshold;
  const daysWorked = opts?.daysWorked ?? 0;

  if (totalScore >= threshold) {
    return { amount: 0, employmentType, pointsShort: 0, basis: `คะแนน ${threshold} ขึ้นไป ไม่หักเงิน` };
  }

  const pointsShort = Math.ceil(threshold - totalScore);
  if (employmentType === "part_time") {
    const monthEarnings = daysWorked * dailyRate;
    const amount = Math.ceil((pointsShort / 100) * monthEarnings);
    return {
      amount,
      employmentType,
      pointsShort,
      basis: `Part time: ขาด ${pointsShort}% × (${daysWorked} วัน × ${dailyRate}) = ${amount}`
    };
  }

  const amount = pointsShort * fullTimeRatePerPoint;
  return {
    amount,
    employmentType,
    pointsShort,
    basis: `Full time: ขาด ${pointsShort} คะแนน × ${fullTimeRatePerPoint} = ${amount}`
  };
}

export function calculateEmployeePerformanceScore(input: EmployeePerformanceInput): EmployeePerformanceScore {
  // Every rate comes from the rulebook (lib/kpi-rules.ts) — defaults unless the owner
  // retuned them at /admin/kpi-rules.
  const rules = input.rules || defaultKpiRules;
  const annualLeave = input.annualLeave || {
    schedules: input.attendance.schedules,
    records: input.attendance.leaveRecords || []
  };
  const leaveRecords = scheduledLeaveRecords(annualLeave.records, annualLeave.schedules);
  const categories = {
    attendance: calculateAttendanceScore(input.attendance, input.now, rules),
    stock: calculateStockScore(input.stockCounts, rules),
    checklist: calculateChecklistScore(input.checklistEvents, rules),
    customerService: calculateCustomerServiceScore(input.serviceEvents, rules),
    assignedWork: calculateAssignedWorkScore(input.assignedWorks, rules)
  };
  const adjustments = input.adjustments || [];
  const adjustmentPoints = adjustments.reduce((sum, adjustment) => sum + Math.round(adjustment.points), 0);
  // Adjustments land on the total, not inside a category: a category is capped at 20, so a
  // correction applied there could silently vanish.
  const totalScore = clampScore(
    categories.attendance.score +
      categories.stock.score +
      categories.checklist.score +
      categories.customerService.score +
      categories.assignedWork.score +
      adjustmentPoints,
    100
  );
  const incentive = getIncentiveTier(totalScore, rules);
  const flags = [
    ...categories.attendance.flags,
    ...categories.stock.flags,
    ...categories.checklist.flags,
    ...categories.customerService.flags,
    ...categories.assignedWork.flags,
    ...(incentive.requiresCoaching ? ["coaching_required"] : [])
  ];

  const hasData = (input.daysWorked ?? 0) > 0 || input.attendance.clockEvents.length > 0;

  return {
    employeeName: input.employeeName,
    totalScore,
    hasData,
    incentive,
    categories,
    adjustmentPoints,
    deductions: [
      ...categories.attendance.deductions,
      ...categories.stock.deductions,
      ...categories.checklist.deductions,
      ...categories.customerService.deductions,
      ...categories.assignedWork.deductions,
      ...adjustments.map((adjustment) => ({
        category: adjustment.category,
        points: -Math.round(adjustment.points),
        reason: adjustment.points >= 0 ? "manual_credit" : "manual_deduction",
        detail: `${adjustment.points >= 0 ? "คืน" : "หักเพิ่ม"} ${Math.abs(Math.round(adjustment.points))} คะแนน (${adjustment.workDate}) — ${adjustment.reason}`,
        source: "manual" as const
      }))
    ],
    flags: [...new Set(flags)],
    warnings: [
      ...categories.attendance.warnings,
      ...categories.stock.warnings,
      ...categories.checklist.warnings,
      ...categories.customerService.warnings,
      ...categories.assignedWork.warnings
    ],
    leaveSummary: summarizeLeave(leaveRecords, rules),
    salaryDeduction: calculateSalaryDeduction(totalScore, {
      employmentType: input.employmentType,
      daysWorked: input.daysWorked,
      dailyRate: rules.salary.partTimeDailyRate,
      fullTimeRatePerPoint: rules.salary.fullTimeRatePerPoint,
      threshold: rules.salary.threshold
    })
  };
}
