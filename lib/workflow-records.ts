export type WorkflowRecordStatus = "saved" | "submitted" | "missed";
export type WorkflowVisualStatus = "white" | "green" | "orange" | "red" | "purple";

export type WorkflowDailyRecord = {
  workDate: string;
  phaseId: string;
  phaseTitle: string;
  completed: number;
  total: number;
  status: WorkflowRecordStatus;
  recordedAt: string;
  startedAt?: string;
  dueAt?: string;
  scheduleStartAt?: string;
  scheduleEndAt?: string;
  checkedKeys?: string[];
  submittedAt?: string;
  adminUnlockedAt?: string;
  adminUnlockedBy?: string;
};

/** Payload stored in one daily work-record document (see lib/work-records.ts). */
export type WorkflowDayPayload = {
  records: WorkflowDailyRecord[];
  notes: Record<string, string>;
  details: Record<string, string>;
};

export const emptyWorkflowDayPayload: WorkflowDayPayload = { records: [], notes: {}, details: {} };

/** How far back the checklist reads history (on-time streaks look back 30 days). */
export const WORKFLOW_HISTORY_DAYS = 35;

/** Flattens the per-day documents returned by the work-record API into one record list. */
export function recordsFromDayPayloads(payloads: Array<Partial<WorkflowDayPayload> | undefined>) {
  return payloads
    .flatMap((payload) => payload?.records || [])
    .sort((left, right) =>
      `${left.workDate}:${left.phaseId}`.localeCompare(`${right.workDate}:${right.phaseId}`)
    );
}

/** Merges the string maps (notes / details) across days — their keys are date-scoped. */
export function mergeDayMaps(maps: Array<Record<string, string> | undefined>) {
  return Object.assign({}, ...maps.filter(Boolean)) as Record<string, string>;
}

export function formatWorkDate(date = new Date()) {
  // The shop runs on the Bangkok business day. `toISOString()` resolves to UTC, so on a
  // UTC server (Vercel) — or a browser between Bangkok 00:00–07:00 — the calendar day rolls
  // back 7h and "today" becomes yesterday. That silently dropped freshly-assigned work from
  // the owner ops board and split staff/owner records across two date buckets. Pin the
  // Bangkok calendar date so every page agrees on the same business day. (en-CA → YYYY-MM-DD)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function upsertWorkflowRecord(records: WorkflowDailyRecord[], record: WorkflowDailyRecord) {
  const next = records.filter(
    (item) => !(item.workDate === record.workDate && item.phaseId === record.phaseId)
  );
  return [...next, record].sort((left, right) => `${left.workDate}:${left.phaseId}`.localeCompare(`${right.workDate}:${right.phaseId}`));
}

export function canEditWorkflowRecord(
  record?: Pick<WorkflowDailyRecord, "status" | "adminUnlockedAt">,
  options: { adminOverride?: boolean } = {}
) {
  if (options.adminOverride) return true;
  if (record?.status === "submitted") return false;
  if (record?.adminUnlockedAt) return Boolean(options.adminOverride);
  return record?.status !== "missed";
}

function bangkokDateAt(workDate: string, time: string) {
  return new Date(`${workDate}T${time}:00+07:00`);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function timeLabel(date: Date) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function bangkokTimeParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value || "0");
  return { hour, minute };
}

export function isWithinWorkflowWorkHours(now = new Date()) {
  const { hour, minute } = bangkokTimeParts(now);
  const totalMinutes = hour * 60 + minute;
  return totalMinutes >= 9 * 60 && totalMinutes < 23 * 60;
}

function bangkokWeekday(workDate: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", weekday: "short" }).format(
    bangkokDateAt(workDate, "00:00")
  );
}

export function storeHoursForWorkDate(workDate: string) {
  const day = bangkokWeekday(workDate);
  const isWeekend = day === "Sat" || day === "Sun";
  return isWeekend ? { open: "09:30", close: "20:30" } : { open: "15:00", close: "22:00" };
}

export function isFlexibleWorkflowPhase(phaseId: string) {
  // Flexible = doable any time the store is open, so it never auto-misses on a window.
  return phaseId === "stock-work" || phaseId === "daytime-work" || phaseId === "guild-chat-exp";
}

/** Shift 1 (opening) works its checklist within this many hours of clocking in. */
export const SHIFT1_WORK_WINDOW_HOURS = 4;

/**
 * Shift context for schedule resolution. When a staffer is on shift 1 (opening), the
 * checklist "actual working time" is counted from their real shift-entry time + 4h — a
 * staff suggestion (ticket MHQqvwhhtpARNEcuecfj) — instead of the fixed store-open hours,
 * because opening staff clock in well before the store opens to customers.
 */
export type ShiftScheduleContext = { shift?: "s1" | "s2" | null; shiftStart?: string | null };

function isValidHhMm(value: string): boolean {
  return /^\d{1,2}:\d{2}$/.test(value);
}

export function phaseScheduleForWorkDate(
  phaseId: string,
  workDate: string,
  context?: ShiftScheduleContext
) {
  // Shift-1 override: window = [เวลาเข้ากะ, เวลาเข้ากะ + 4h] for every phase the opener does.
  if (context?.shift === "s1" && context.shiftStart && isValidHhMm(context.shiftStart)) {
    const startAt = bangkokDateAt(workDate, context.shiftStart);
    const endAt = addMinutes(startAt, SHIFT1_WORK_WINDOW_HOURS * 60);
    return {
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      dueAt: endAt.toISOString(),
      startLabel: timeLabel(startAt),
      endLabel: timeLabel(endAt),
      dueMinutes: SHIFT1_WORK_WINDOW_HOURS * 60
    };
  }

  const hours = storeHoursForWorkDate(workDate);
  const openAt = bangkokDateAt(workDate, hours.open);
  const closeAt = bangkokDateAt(workDate, hours.close);
  const closeStartAt = addMinutes(closeAt, -60);

  const schedule =
    phaseId === "open-store"
      ? { startAt: addMinutes(openAt, -30), endAt: openAt }
      : phaseId === "close-store"
        ? { startAt: closeStartAt, endAt: closeAt }
        : isFlexibleWorkflowPhase(phaseId)
          ? { startAt: openAt, endAt: closeAt }
          : { startAt: openAt, endAt: closeStartAt };

  return {
    startAt: schedule.startAt.toISOString(),
    endAt: schedule.endAt.toISOString(),
    dueAt: schedule.endAt.toISOString(),
    startLabel: timeLabel(schedule.startAt),
    endLabel: timeLabel(schedule.endAt),
    dueMinutes: Math.max(0, Math.round((schedule.endAt.getTime() - schedule.startAt.getTime()) / 60000))
  };
}

export function isPhasePastDue(
  phaseId: string,
  workDate: string,
  now = new Date(),
  context?: ShiftScheduleContext
) {
  return Date.parse(phaseScheduleForWorkDate(phaseId, workDate, context).dueAt) < now.getTime();
}

export function canAdminUnlockWorkflowRecord(
  record: Pick<WorkflowDailyRecord, "status"> | undefined,
  phaseId: string,
  workDate: string,
  now = new Date(),
  context?: ShiftScheduleContext
) {
  if (record?.status === "submitted") return false;
  if (record?.status === "missed") return true;
  return isPhasePastDue(phaseId, workDate, now, context);
}

export function shouldAutoMissWorkflowRecord(
  record: Pick<WorkflowDailyRecord, "status" | "adminUnlockedAt"> | undefined,
  phaseId: string,
  workDate: string,
  now = new Date(),
  context?: ShiftScheduleContext
) {
  if (isFlexibleWorkflowPhase(phaseId)) return false;
  if (record?.status === "submitted" || record?.status === "missed") return false;
  if (record?.adminUnlockedAt) return false;
  return isPhasePastDue(phaseId, workDate, now, context);
}

function phaseCanAdvance(records: WorkflowDailyRecord[], workDate: string, phaseId: string) {
  const record = records.find((item) => item.workDate === workDate && item.phaseId === phaseId);
  return Boolean(
    record &&
      ((record.status === "submitted" && record.completed >= record.total) || record.status === "missed")
  );
}

// The routine runs in order — a phase only opens once every phase before it is finished
// (or was already missed, so the day isn't dead-ended).
const workflowPhaseOrder = ["open-store", "guild-chat-exp", "daytime-work", "stock-work", "close-store"];

/**
 * `visiblePhaseIds` = the phases this person actually sees today (the checklist is
 * shift-filtered). Records are per employee, so an s2 staffer has no s1 open-store record
 * of their own — gating them on it would lock their whole day. Sequencing therefore only
 * applies within the phases in front of them.
 */
export function isPhaseUnlocked(
  phaseId: string,
  workDate: string,
  records: WorkflowDailyRecord[],
  visiblePhaseIds?: string[]
) {
  const order = visiblePhaseIds
    ? workflowPhaseOrder.filter((id) => visiblePhaseIds.includes(id))
    : workflowPhaseOrder;
  const index = order.indexOf(phaseId);
  if (index <= 0) return true;
  return order.slice(0, index).every((previousPhaseId) => phaseCanAdvance(records, workDate, previousPhaseId));
}

export function elapsedSeconds(startedAt?: string, submittedAt?: string) {
  if (!startedAt || !submittedAt) return 0;
  return Math.max(0, Math.round((Date.parse(submittedAt) - Date.parse(startedAt)) / 1000));
}

export function isWorkflowRecordOnTime(
  record: Pick<WorkflowDailyRecord, "completed" | "total" | "submittedAt" | "dueAt"> | WorkflowDailyRecord
) {
  return Boolean(record.submittedAt && record.dueAt && record.completed >= record.total && Date.parse(record.submittedAt) <= Date.parse(record.dueAt));
}

function previousWorkDate(workDate: string, daysBack: number) {
  const date = bangkokDateAt(workDate, "12:00");
  date.setUTCDate(date.getUTCDate() - daysBack);
  return date.toISOString().slice(0, 10);
}

export function onTimeStreakForPhase(records: WorkflowDailyRecord[], workDate: string, phaseId: string) {
  let streak = 0;
  for (let dayOffset = 0; dayOffset < 30; dayOffset += 1) {
    const dateKey = previousWorkDate(workDate, dayOffset);
    const record = records.find((item) => item.workDate === dateKey && item.phaseId === phaseId);
    if (!record || record.status !== "submitted" || !isWorkflowRecordOnTime(record)) break;
    streak += 1;
  }
  return streak;
}

export function workflowVisualStatus(
  records: WorkflowDailyRecord[],
  workDate: string,
  phaseId: string,
  now = new Date()
): WorkflowVisualStatus {
  const record = records.find((item) => item.workDate === workDate && item.phaseId === phaseId);
  const schedule = phaseScheduleForWorkDate(phaseId, workDate);

  if (record?.status === "submitted") {
    if (!isWorkflowRecordOnTime(record)) return "orange";
    return onTimeStreakForPhase(records, workDate, phaseId) >= 3 ? "purple" : "green";
  }

  if (!isFlexibleWorkflowPhase(phaseId) && isPhasePastDue(phaseId, workDate, now)) return "red";
  return "white";
}

export function summarizeMonthlyRecords(records: WorkflowDailyRecord[], monthKey: string) {
  const submitted = records.filter((record) => record.workDate.startsWith(monthKey) && record.status === "submitted");
  const completedRecords = submitted.filter((record) => record.completed >= record.total).length;
  const submittedRecords = submitted.length;
  const completionRate = submittedRecords > 0 ? Math.round((completedRecords / submittedRecords) * 100) : 0;
  const totalChecklist = submitted.reduce((sum, record) => sum + record.total, 0);
  const completedChecklist = submitted.reduce((sum, record) => sum + record.completed, 0);
  const onTimeRecords = submitted.filter(isWorkflowRecordOnTime).length;

  return {
    monthKey,
    submittedRecords,
    completedRecords,
    completionRate,
    onTimeRecords,
    completedChecklist,
    totalChecklist
  };
}
