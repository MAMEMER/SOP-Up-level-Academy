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

export const workflowStorageKey = "up-level-workflow-records";
export const workflowRecordingEnabled = false;

export function canPersistWorkflowRecords() {
  return workflowRecordingEnabled;
}

export function readWorkflowRecordsFromStorage(storage: Pick<Storage, "getItem" | "removeItem">) {
  if (!canPersistWorkflowRecords()) return [];

  const stored = storage.getItem(workflowStorageKey);
  if (!stored) return [];

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as WorkflowDailyRecord[]) : [];
  } catch {
    storage.removeItem(workflowStorageKey);
    return [];
  }
}

export function formatWorkDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
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
  return phaseId === "stock-work" || phaseId === "daytime-work";
}

export function phaseScheduleForWorkDate(phaseId: string, workDate: string) {
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

export function isPhasePastDue(phaseId: string, workDate: string, now = new Date()) {
  return Date.parse(phaseScheduleForWorkDate(phaseId, workDate).dueAt) < now.getTime();
}

export function canAdminUnlockWorkflowRecord(
  record: Pick<WorkflowDailyRecord, "status"> | undefined,
  phaseId: string,
  workDate: string,
  now = new Date()
) {
  if (record?.status === "submitted") return false;
  if (record?.status === "missed") return true;
  return isPhasePastDue(phaseId, workDate, now);
}

export function shouldAutoMissWorkflowRecord(
  record: Pick<WorkflowDailyRecord, "status" | "adminUnlockedAt"> | undefined,
  phaseId: string,
  workDate: string,
  now = new Date()
) {
  if (isFlexibleWorkflowPhase(phaseId)) return false;
  if (record?.status === "submitted" || record?.status === "missed") return false;
  if (record?.adminUnlockedAt) return false;
  return isPhasePastDue(phaseId, workDate, now);
}

function phaseCanAdvance(records: WorkflowDailyRecord[], workDate: string, phaseId: string) {
  const record = records.find((item) => item.workDate === workDate && item.phaseId === phaseId);
  return Boolean(
    record &&
      ((record.status === "submitted" && record.completed >= record.total) || record.status === "missed")
  );
}

export function isPhaseUnlocked(phaseId: string, workDate: string, records: WorkflowDailyRecord[]) {
  if (phaseId === "open-store") return true;
  if (phaseId === "stock-work") return phaseCanAdvance(records, workDate, "open-store");
  if (phaseId === "daytime-work") {
    return phaseCanAdvance(records, workDate, "open-store") && phaseCanAdvance(records, workDate, "stock-work");
  }
  if (phaseId === "close-store") {
    return (
      phaseCanAdvance(records, workDate, "open-store") &&
      phaseCanAdvance(records, workDate, "stock-work") &&
      phaseCanAdvance(records, workDate, "daytime-work")
    );
  }
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
