import { CHECKLIST_DAY_END, CHECKLIST_DAY_START, resolvePhaseWindow, type PhaseWindows } from "./daily-checklist.ts";

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
  // Runs to 23:59: ปิดร้าน is due at 23:59, so a 23:00 cut-off would lock the closing
  // shift out of the very checklist it is being scored on.
  return totalMinutes >= toMinutes(CHECKLIST_DAY_START) && totalMinutes <= toMinutes(CHECKLIST_DAY_END);
}

function toMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
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

/**
 * The window a phase runs on today, in Bangkok time.
 *
 * Each หัวข้อ carries its own clock time (owner-editable at /admin/checklist-config):
 * `dueAt` is the deadline — submitting after it still works, it costs 2 KPI points — and
 * `endAt` is the hard end of the business day, after which nothing can be submitted.
 * `startAt` locks a phase that must not be done early (ปิดร้าน opens at 19:00).
 *
 * Replaces the old model where the window was derived from store hours and, for shift 1,
 * from clock-in + 4h. Times are now the same for everyone on the หัวข้อ, so a staffer can
 * read the deadline off the card and the KPI charges the same lateness to both shifts.
 */
export function phaseScheduleForWorkDate(phaseId: string, workDate: string, windows?: PhaseWindows) {
  const window = resolvePhaseWindow(phaseId, windows);
  const startAt = bangkokDateAt(workDate, window.openTime || CHECKLIST_DAY_START);
  const dueAt = bangkokDateAt(workDate, window.dueTime);
  const endAt = bangkokDateAt(workDate, CHECKLIST_DAY_END);

  return {
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    dueAt: dueAt.toISOString(),
    startLabel: timeLabel(startAt),
    endLabel: timeLabel(endAt),
    dueLabel: timeLabel(dueAt),
    /** true when the phase may not be started before startAt (e.g. ปิดร้าน) */
    hasOpenTime: Boolean(window.openTime),
    dueMinutes: Math.max(0, Math.round((dueAt.getTime() - startAt.getTime()) / 60000))
  };
}

/** Past the deadline — still submittable, but the submission counts as late (-2). */
export function isPhasePastDue(phaseId: string, workDate: string, now = new Date(), windows?: PhaseWindows) {
  return Date.parse(phaseScheduleForWorkDate(phaseId, workDate, windows).dueAt) < now.getTime();
}

/** Before the phase opens — ปิดร้าน cannot be ticked off at noon. */
export function isPhaseNotYetOpen(phaseId: string, workDate: string, now = new Date(), windows?: PhaseWindows) {
  const schedule = phaseScheduleForWorkDate(phaseId, workDate, windows);
  return schedule.hasOpenTime && now.getTime() < Date.parse(schedule.startAt);
}

/** After the business day ends (23:59) — the phase is closed for good. */
export function isPhaseDayClosed(phaseId: string, workDate: string, now = new Date(), windows?: PhaseWindows) {
  return Date.parse(phaseScheduleForWorkDate(phaseId, workDate, windows).endAt) < now.getTime();
}

/** The phase accepts a submission right now (late is allowed, early and next-day are not). */
export function isPhaseSubmittable(phaseId: string, workDate: string, now = new Date(), windows?: PhaseWindows) {
  return !isPhaseNotYetOpen(phaseId, workDate, now, windows) && !isPhaseDayClosed(phaseId, workDate, now, windows);
}

export function canAdminUnlockWorkflowRecord(
  record: Pick<WorkflowDailyRecord, "status"> | undefined,
  phaseId: string,
  workDate: string,
  now = new Date(),
  windows?: PhaseWindows
) {
  if (record?.status === "submitted") return false;
  if (record?.status === "missed") return true;
  return isPhasePastDue(phaseId, workDate, now, windows);
}

export function shouldAutoMissWorkflowRecord(
  record: Pick<WorkflowDailyRecord, "status" | "adminUnlockedAt"> | undefined,
  phaseId: string,
  workDate: string,
  now = new Date(),
  windows?: PhaseWindows
) {
  if (record?.status === "submitted" || record?.status === "missed") return false;
  if (record?.adminUnlockedAt) return false;
  // Missed only once the day is over: between the deadline and 23:59 the phase is still
  // open and the staffer can hand it in late for -2 instead of losing it entirely.
  return isPhaseDayClosed(phaseId, workDate, now, windows);
}

/**
 * Phases are no longer sequenced — หัวข้อ can be done in any order, each one is held to
 * its own clock time instead of to the one before it. Kept as a function because the
 * checklist UI asks per phase, and a future rule might lock a phase again.
 */
export function isPhaseUnlocked(
  _phaseId: string,
  _workDate: string,
  _records: WorkflowDailyRecord[],
  _visiblePhaseIds?: string[]
) {
  return true;
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
  now = new Date(),
  windows?: PhaseWindows
): WorkflowVisualStatus {
  const record = records.find((item) => item.workDate === workDate && item.phaseId === phaseId);

  if (record?.status === "submitted") {
    if (!isWorkflowRecordOnTime(record)) return "orange";
    return onTimeStreakForPhase(records, workDate, phaseId) >= 3 ? "purple" : "green";
  }

  // Red = lost for the day. Orange = past the deadline but still handable in, for -2.
  if (isPhaseDayClosed(phaseId, workDate, now, windows)) return "red";
  if (isPhasePastDue(phaseId, workDate, now, windows)) return "orange";
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
