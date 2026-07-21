export type DataSource = "google-sheet" | "storehub" | "manual" | "mock" | "import" | "live";

export type DeductionRecord = {
  category: "attendance" | "stock" | "checklist" | "customer_service" | "assigned_work";
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

export type ChecklistEvent = {
  type: "missing_day" | "missing_important" | "backfilled" | "false_record";
  count: number;
  source: DataSource;
  dates?: string[];
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
  percent: 0 | 20 | 50 | 80 | 100;
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
};

export type EmployeePerformanceScore = {
  employeeName: string;
  totalScore: number;
  incentive: IncentiveTier;
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

function dateKey(employeeName: string, workDate: string) {
  return `${employeeName.trim().toLowerCase()}:${workDate}`;
}

function minutesLate(scheduledStart: string, clockIn: string) {
  return Math.max(0, Math.floor((Date.parse(clockIn) - Date.parse(scheduledStart)) / 60_000));
}

export function summarizeLeave(records: LeaveRecord[]): LeaveSummary {
  const sickUsed = records.filter((record) => record.type === "sick").length;
  const personalUsed = records.filter((record) => record.type === "personal").length;
  return {
    sickUsed,
    sickAllowance: 30,
    sickRemaining: Math.max(0, 30 - sickUsed),
    personalUsed,
    personalAllowance: 3,
    personalRemaining: Math.max(0, 3 - personalUsed),
    records
  };
}

function scheduledLeaveRecords(records: LeaveRecord[], schedules: ShiftSchedule[]) {
  const scheduledWorkDays = new Set(schedules.map((schedule) => dateKey(schedule.employeeName, schedule.workDate)));
  return records.filter((record) => scheduledWorkDays.has(dateKey(record.employeeName, record.workDate)));
}

export function calculateAttendanceScore(input: AttendanceInput): ScoreResult {
  const deductions: DeductionRecord[] = [];
  const warnings: string[] = [];
  const clocks = new Map(input.clockEvents.map((event) => [dateKey(event.employeeName, event.workDate), event]));
  const schedules = new Set(input.schedules.map((schedule) => dateKey(schedule.employeeName, schedule.workDate)));
  const approvedLeave = new Set((input.leaveRecords || []).map((record) => dateKey(record.employeeName, record.workDate)));

  input.schedules.forEach((schedule) => {
    if (approvedLeave.has(dateKey(schedule.employeeName, schedule.workDate))) return;

    const clock = clocks.get(dateKey(schedule.employeeName, schedule.workDate));
    if (!clock) {
      deductions.push({
        category: "attendance",
        points: 2,
        reason: "late_over_30_minutes_or_missing_clock_in",
        detail: `${schedule.employeeName} missing clock-in or late over 30 minutes on ${schedule.workDate}`,
        source: schedule.source
      });
      return;
    }

    const lateMinutes = minutesLate(schedule.scheduledStart, clock.clockIn);
    if (lateMinutes > 10) {
      deductions.push({
        category: "attendance",
        points: 2,
        reason: "late_over_10_minutes",
        detail: `${schedule.employeeName} late ${lateMinutes} minutes on ${schedule.workDate}`,
        source: clock.source
      });
    } else if (lateMinutes > 0) {
      deductions.push({
        category: "attendance",
        points: 1,
        reason: "late_within_10_minutes",
        detail: `${schedule.employeeName} late ${lateMinutes} minutes on ${schedule.workDate}`,
        source: clock.source
      });
    }
  });

  input.clockEvents.forEach((clock) => {
    if (approvedLeave.has(dateKey(clock.employeeName, clock.workDate))) return;

    if (!schedules.has(dateKey(clock.employeeName, clock.workDate))) {
      warnings.push(`Unmatched StoreHub clock-in for ${clock.employeeName} on ${clock.workDate}`);
    }
  });

  const totalDeduction = deductions.reduce((sum, deduction) => sum + deduction.points, 0);
  return { score: clampScore(20 - totalDeduction, 20), maxScore: 20, deductions, flags: [], warnings };
}

export function calculateStockScore(records: StockCountRecord[]): ScoreResult {
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
      const points = notCountedOccurrence <= 2 ? 10 : 5;
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
        points: 2,
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
          points: 2,
          reason: "stock_difference",
          detail: `${record.category} has StoreHub Difference`,
          source: record.source
        });
      }
    }

    if (record.discrepancyStatus === "fraud_review") flags.push("management_review_required");
  });

  const totalDeduction = deductions.reduce((sum, deduction) => sum + deduction.points, 0);
  return { score: clampScore(20 - totalDeduction, 20), maxScore: 20, deductions, flags: [...new Set(flags)], warnings };
}

export function calculateChecklistScore(events: ChecklistEvent[]): ScoreResult {
  const deductions: DeductionRecord[] = [];
  const flags: string[] = [];

  events.forEach((event) => {
    // KPI 21 Jul 2026: missing checklist day = -5 (was 10); no more backfill credit (checklist must
    // close same-day) so backfilled carries no penalty; false/false-on-audit stays -10.
    const pointsByType = { missing_day: 5, missing_important: 2, backfilled: 0, false_record: 10 } satisfies Record<ChecklistEvent["type"], number>;
    const dateDetail = event.dates?.length ? ` (${event.dates.join(", ")})` : "";
    const detailByType = {
      missing_day: `มีกะและ clock-in แต่ไม่มีข้อมูล Google Form checklist x ${event.count} วัน${dateDetail}`,
      missing_important: `missing_important x ${event.count}`,
      backfilled: `backfilled x ${event.count}`,
      false_record: `false_record x ${event.count}`
    } satisfies Record<ChecklistEvent["type"], string>;
    deductions.push({
      category: "checklist",
      points: pointsByType[event.type] * event.count,
      reason: event.type,
      detail: detailByType[event.type],
      source: event.source
    });
    if (event.type === "false_record") flags.push("coaching_required");
  });

  const totalDeduction = deductions.reduce((sum, deduction) => sum + deduction.points, 0);
  return { score: clampScore(20 - totalDeduction, 20), maxScore: 20, deductions, flags: [...new Set(flags)], warnings: [] };
}

export function calculateCustomerServiceScore(events: ServiceEvent[]): ScoreResult {
  const deductions: DeductionRecord[] = [];
  const flags: string[] = [];
  const bucketScores = { feedback: 10, event_response: 10 };

  events.forEach((event) => {
    let targetScore = bucketScores[event.bucket];
    if (event.severity === "severe") {
      // Severe complaint zeroes the bucket (= -10) and requires coaching.
      targetScore = 0;
      flags.push("coaching_required");
    } else if (event.severity === "repeated") {
      // Repeat of the same complaint zeroes the bucket (= -10) and requires coaching.
      targetScore = 0;
      flags.push("coaching_required");
    } else {
      // First complaint / fixed on the spot: -5 per occurrence within the bucket.
      targetScore = Math.max(0, targetScore - event.count * 5);
    }

    const deductionPoints = bucketScores[event.bucket] - targetScore;
    if (deductionPoints > 0) {
      deductions.push({
        category: "customer_service",
        points: deductionPoints,
        reason: `${event.bucket}_${event.severity}`,
        detail: `${event.bucket} ${event.severity} x ${event.count}`,
        source: event.source
      });
    }
    bucketScores[event.bucket] = targetScore;
  });

  return {
    score: clampScore(bucketScores.feedback + bucketScores.event_response, 20),
    maxScore: 20,
    deductions,
    flags: [...new Set(flags)],
    warnings: []
  };
}

// KPI 21 Jul 2026: assigned work is scored by cumulative deductions from 20 (not an average).
// early/on-time = no cut; needs revision or 1-day-late = -2; not finished / overdue = -10 + coach.
function assignedWorkItemDeduction(status: AssignedWork["status"]) {
  if (status === "needs_revision") return 2;
  if (status === "late_one_day") return 2;
  if (status === "not_finished") return 10;
  return 0;
}

export function calculateAssignedWorkScore(works: AssignedWork[]): ScoreResult {
  if (works.length === 0) return { score: 20, maxScore: 20, deductions: [], flags: [], warnings: [] };

  const flags: string[] = [];
  const deductions: DeductionRecord[] = [];
  works.forEach((work) => {
    if (work.status === "not_finished") flags.push("coaching_required");
    const points = assignedWorkItemDeduction(work.status);
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
  return { score: clampScore(20 - totalDeduction, 20), maxScore: 20, deductions, flags: [...new Set(flags)], warnings: [] };
}

export function getIncentiveTier(totalScore: number): IncentiveTier {
  if (totalScore >= 90) return { label: "90-100", percent: 100, requiresCoaching: false };
  if (totalScore >= 80) return { label: "80-89", percent: 80, requiresCoaching: false };
  if (totalScore >= 70) return { label: "70-79", percent: 50, requiresCoaching: false };
  if (totalScore >= 60) return { label: "60-69", percent: 20, requiresCoaching: false };
  return { label: "ต่ำกว่า 60", percent: 0, requiresCoaching: true };
}

// KPI 21 Jul 2026: below 50 total, salary is docked. Full time = whole points short × 500.
// Part time = points-short percent of the month's earnings (daysWorked × dailyRate). Rounds up.
export function calculateSalaryDeduction(
  totalScore: number,
  opts?: { employmentType?: EmploymentType; daysWorked?: number; dailyRate?: number; fullTimeRatePerPoint?: number }
): SalaryDeduction {
  const employmentType = opts?.employmentType ?? "full_time";
  const dailyRate = opts?.dailyRate ?? 400;
  const fullTimeRatePerPoint = opts?.fullTimeRatePerPoint ?? 500;
  const daysWorked = opts?.daysWorked ?? 0;

  if (totalScore >= 50) {
    return { amount: 0, employmentType, pointsShort: 0, basis: "คะแนน 50 ขึ้นไป ไม่หักเงิน" };
  }

  const pointsShort = Math.ceil(50 - totalScore);
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
  const annualLeave = input.annualLeave || {
    schedules: input.attendance.schedules,
    records: input.attendance.leaveRecords || []
  };
  const leaveRecords = scheduledLeaveRecords(annualLeave.records, annualLeave.schedules);
  const categories = {
    attendance: calculateAttendanceScore(input.attendance),
    stock: calculateStockScore(input.stockCounts),
    checklist: calculateChecklistScore(input.checklistEvents),
    customerService: calculateCustomerServiceScore(input.serviceEvents),
    assignedWork: calculateAssignedWorkScore(input.assignedWorks)
  };
  const totalScore = clampScore(
    categories.attendance.score +
      categories.stock.score +
      categories.checklist.score +
      categories.customerService.score +
      categories.assignedWork.score,
    100
  );
  const incentive = getIncentiveTier(totalScore);
  const flags = [
    ...categories.attendance.flags,
    ...categories.stock.flags,
    ...categories.checklist.flags,
    ...categories.customerService.flags,
    ...categories.assignedWork.flags,
    ...(incentive.requiresCoaching ? ["coaching_required"] : [])
  ];

  return {
    employeeName: input.employeeName,
    totalScore,
    incentive,
    categories,
    deductions: [
      ...categories.attendance.deductions,
      ...categories.stock.deductions,
      ...categories.checklist.deductions,
      ...categories.customerService.deductions,
      ...categories.assignedWork.deductions
    ],
    flags: [...new Set(flags)],
    warnings: [
      ...categories.attendance.warnings,
      ...categories.stock.warnings,
      ...categories.checklist.warnings,
      ...categories.customerService.warnings,
      ...categories.assignedWork.warnings
    ],
    leaveSummary: summarizeLeave(leaveRecords),
    salaryDeduction: calculateSalaryDeduction(totalScore, {
      employmentType: input.employmentType,
      daysWorked: input.daysWorked
    })
  };
}
