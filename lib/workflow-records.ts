import { CHECKLIST_DAY_END, CHECKLIST_DAY_START, resolvePhaseWindow, type PhaseWindows } from "./daily-checklist.ts";

/**
 * What a schedule lookup needs: the owner-configured windows, and which กะ is asking
 * (a หัวข้อ shared by both can be due at different hours — see defaultPhaseWindows).
 */
export type PhaseScheduleContext = { windows?: PhaseWindows; shift?: "s1" | "s2" | null };

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

const recordKey = (record: Pick<WorkflowDailyRecord, "workDate" | "phaseId">) => `${record.workDate}:${record.phaseId}`;

function earlier(left?: string, right?: string) {
  if (!left) return right;
  if (!right) return left;
  return Date.parse(left) <= Date.parse(right) ? left : right;
}

/**
 * เวลาส่งงานต้องเป็น "ครั้งแรกที่กดส่ง" เสมอ.
 *
 * เดิมทุกครั้งที่บันทึก client ส่ง submittedAt = เวลาปัจจุบันมาทับของเดิม. พอพนักงานกดส่ง
 * ซ้ำอีกรอบ (เปิดค้างไว้อีกแท็บ/อีกเครื่อง ที่ข้อมูลในหน้ายังเป็นก่อนส่ง จึงไม่โดน
 * canEditWorkflowRecord กัน) เวลารอบหลังจะชนะ — หัวข้อที่ส่งทันเวลากลายเป็น "ส่งช้า"
 * และโดนหัก KPI ทั้งที่ส่งตรงเวลา (เคสจริง: เปิดร้าน 10 ส.ค. กำหนด 13:00 กลายเป็น 15:03).
 *
 * ยกเว้นกรณีเดียว: admin ปลดล็อกให้ทำใหม่หลังจากส่งไปแล้ว — รอบนั้นเวลาใหม่คือของจริง.
 *
 * เป็น pure function และบังคับฝั่ง server เพราะ client เชื่อไม่ได้.
 */
export function preserveFirstSubmission(
  existing: WorkflowDailyRecord[],
  incoming: WorkflowDailyRecord[]
): WorkflowDailyRecord[] {
  const previous = new Map(existing.map((record) => [recordKey(record), record]));
  const seen = new Set(incoming.map(recordKey));
  const merged = incoming.map((record) => {
    const before = previous.get(recordKey(record));
    if (!before) return record;

    const unlockedAfterSubmit =
      Boolean(record.adminUnlockedAt) &&
      (!before.submittedAt || Date.parse(record.adminUnlockedAt!) > Date.parse(before.submittedAt));

    // งานเริ่มเมื่อไหร่ก็ต้องเป็นครั้งแรกเช่นกัน ไม่งั้น "ใช้เวลากี่นาที" เพี้ยนตาม
    const startedAt = earlier(before.startedAt, record.startedAt);
    const submittedAt = unlockedAfterSubmit ? record.submittedAt : earlier(before.submittedAt, record.submittedAt);

    // ห้ามใส่คีย์ที่ค่าเป็น undefined: ฝั่ง client คีย์พวกนี้หายไปตอน JSON.stringify แต่ของที่
    // ประกอบขึ้นบน server จะเหลือ undefined จริงๆ แล้ว Firestore ปฏิเสธทั้ง document
    // (หัวข้อที่ยังไม่ได้ส่งจึงบันทึกไม่ได้เลยทั้งวัน)
    const merged: WorkflowDailyRecord = { ...record };
    if (startedAt) merged.startedAt = startedAt;
    else delete merged.startedAt;
    if (submittedAt) merged.submittedAt = submittedAt;
    else delete merged.submittedAt;
    return merged;
  });

  // แท็บที่เปิดค้างไว้จะส่ง "รายการทั้งวัน" แบบเก่ามาทับ — หัวข้อที่ส่งไปหลังจากนั้นจะหาย
  // ทั้งใบ. เก็บของเดิมที่ไม่ได้ถูกส่งมาด้วยไว้เสมอ (ไม่มี UI ไหนลบ record อยู่แล้ว)
  const dropped = existing.filter((record) => !seen.has(recordKey(record)));
  return [...merged, ...dropped];
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
  // 09:00–23:59 Bangkok. The closing (กะ2) checklist window now runs to 23:59, so writes
  // must stay allowed right up to end-of-day; earlier this capped at 23:00 and locked the
  // last hour of closing. (ใบงาน fnpHvruMlF4Vvg7UvJUQ — ปรับเวลา checklist บางแค)
  return totalMinutes >= 9 * 60 && totalMinutes < 24 * 60;
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
 * The window a หัวข้อ runs on today. Times come from the owner config (built-in defaults in
 * lib/daily-checklist.ts) and are absolute Bangkok clock times, per shift where the two กะ
 * do the same หัวข้อ at different hours.
 *
 * `dueAt` is the deadline — submitting after it still works, it costs 2 KPI points — and
 * `endAt` is the hard end of the business day, after which nothing can be submitted.
 * `startAt` locks a หัวข้อ that must not be done early (ปิดร้าน opens at 19:00).
 */
export function phaseScheduleForWorkDate(phaseId: string, workDate: string, context?: PhaseScheduleContext) {
  const window = resolvePhaseWindow(phaseId, context?.windows, context?.shift);
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
    /** true when the หัวข้อ may not be started before startAt (e.g. ปิดร้าน) */
    hasOpenTime: Boolean(window.openTime) && window.openTime !== CHECKLIST_DAY_START,
    dueMinutes: Math.max(0, Math.round((dueAt.getTime() - startAt.getTime()) / 60000))
  };
}

/** Past the deadline — still submittable, but the submission counts as late (-2). */
export function isPhasePastDue(phaseId: string, workDate: string, now = new Date(), context?: PhaseScheduleContext) {
  return Date.parse(phaseScheduleForWorkDate(phaseId, workDate, context).dueAt) < now.getTime();
}

/** Before the หัวข้อ opens — ปิดร้าน cannot be ticked off at noon. */
export function isPhaseNotYetOpen(phaseId: string, workDate: string, now = new Date(), context?: PhaseScheduleContext) {
  const schedule = phaseScheduleForWorkDate(phaseId, workDate, context);
  return schedule.hasOpenTime && now.getTime() < Date.parse(schedule.startAt);
}

/** After the business day ends (23:59) — the หัวข้อ is closed for good. */
export function isPhaseDayClosed(phaseId: string, workDate: string, now = new Date(), context?: PhaseScheduleContext) {
  return Date.parse(phaseScheduleForWorkDate(phaseId, workDate, context).endAt) < now.getTime();
}

/** The หัวข้อ accepts a submission right now (late is allowed, early and next-day are not). */
export function isPhaseSubmittable(phaseId: string, workDate: string, now = new Date(), context?: PhaseScheduleContext) {
  return !isPhaseNotYetOpen(phaseId, workDate, now, context) && !isPhaseDayClosed(phaseId, workDate, now, context);
}

export function canAdminUnlockWorkflowRecord(
  record: Pick<WorkflowDailyRecord, "status"> | undefined,
  phaseId: string,
  workDate: string,
  now = new Date(),
  context?: PhaseScheduleContext
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
  context?: PhaseScheduleContext
) {
  if (record?.status === "submitted" || record?.status === "missed") return false;
  if (record?.adminUnlockedAt) return false;
  // Missed only once the day is over: between the deadline and 23:59 the หัวข้อ is still
  // open and the staffer can hand it in late for -2 instead of losing it entirely.
  return isPhaseDayClosed(phaseId, workDate, now, context);
}

/**
 * หัวข้อ are no longer sequenced — they can be done in any order, each one held to its own
 * clock time instead of to the one before it. Kept as a function because the checklist UI
 * asks per หัวข้อ, and a future rule might lock one again.
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
  context?: PhaseScheduleContext
): WorkflowVisualStatus {
  const record = records.find((item) => item.workDate === workDate && item.phaseId === phaseId);

  if (record?.status === "submitted") {
    if (!isWorkflowRecordOnTime(record)) return "orange";
    return onTimeStreakForPhase(records, workDate, phaseId) >= 3 ? "purple" : "green";
  }

  // Red = lost for the day. Orange = past the deadline but still handable in, for -2.
  if (isPhaseDayClosed(phaseId, workDate, now, context)) return "red";
  if (isPhasePastDue(phaseId, workDate, now, context)) return "orange";
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
