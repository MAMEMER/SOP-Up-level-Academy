import { isWorkflowRecordOnTime, type WorkflowDailyRecord } from "./workflow-records.ts";

/**
 * A monthly record tagged with who wrote it. `getMonthlyTeamRecords` flattens every
 * employee's day docs into one anonymous list — fine for a whole-month rollup, but the
 * owner monitor needs to see WHO submitted WHAT on a given day, so we keep the author.
 */
export type NamedWorkflowRecord = WorkflowDailyRecord & {
  employeeName: string;
  employeeEmail: string;
};

/** The two states the monitor shows: work handed in (submitted) or overdue-unsent (missed). */
export function isReviewableRecord(record: WorkflowDailyRecord) {
  return record.status === "submitted" || record.status === "missed";
}

/** Distinct work dates that have something to review, newest first (for the date picker). */
export function reviewableDates(records: WorkflowDailyRecord[], monthKey: string): string[] {
  const dates = new Set<string>();
  for (const record of records) {
    if (record.workDate.startsWith(monthKey) && isReviewableRecord(record)) dates.add(record.workDate);
  }
  return [...dates].sort((left, right) => right.localeCompare(left));
}

/** Distinct work types present in the month, for the type filter. Keyed by phaseId, labelled by title. */
export function reviewablePhaseTypes(
  records: WorkflowDailyRecord[],
  monthKey: string
): Array<{ phaseId: string; phaseTitle: string }> {
  const map = new Map<string, string>();
  for (const record of records) {
    if (record.workDate.startsWith(monthKey) && isReviewableRecord(record) && !map.has(record.phaseId)) {
      map.set(record.phaseId, record.phaseTitle);
    }
  }
  return [...map.entries()]
    .map(([phaseId, phaseTitle]) => ({ phaseId, phaseTitle }))
    .sort((left, right) => left.phaseTitle.localeCompare(right.phaseTitle, "th"));
}

export type SummaryFilter = {
  /** "YYYY-MM" for the whole month, or a full "YYYY-MM-DD" to focus one day. */
  datePrefix: string;
  /** a specific phaseId, or "all" for every work type. */
  phaseId: string;
};

/** The reviewable records that match the current date + work-type filter. */
export function filterReviewRecords<T extends WorkflowDailyRecord>(records: T[], filter: SummaryFilter): T[] {
  return records.filter(
    (record) =>
      isReviewableRecord(record) &&
      record.workDate.startsWith(filter.datePrefix) &&
      (filter.phaseId === "all" || record.phaseId === filter.phaseId)
  );
}

export type StaffSummaryGroup = {
  employeeName: string;
  employeeEmail: string;
  records: NamedWorkflowRecord[];
  submitted: number;
  missed: number;
};

/** Groups the filtered records by the staff member who submitted them (sorted Thai by name). */
export function groupRecordsByStaff(records: NamedWorkflowRecord[]): StaffSummaryGroup[] {
  const groups = new Map<string, StaffSummaryGroup>();
  for (const record of records) {
    const key = record.employeeEmail.toLowerCase();
    let group = groups.get(key);
    if (!group) {
      group = { employeeName: record.employeeName, employeeEmail: record.employeeEmail, records: [], submitted: 0, missed: 0 };
      groups.set(key, group);
    }
    group.records.push(record);
    if (record.status === "submitted") group.submitted += 1;
    else if (record.status === "missed") group.missed += 1;
  }
  for (const group of groups.values()) {
    group.records.sort((left, right) =>
      `${left.workDate}:${left.phaseTitle}`.localeCompare(`${right.workDate}:${right.phaseTitle}`, "th")
    );
  }
  return [...groups.values()].sort((left, right) => left.employeeName.localeCompare(right.employeeName, "th"));
}

/** Headline counts for whatever slice (date/type) is currently in view. */
export function summariseReviewRecords(records: WorkflowDailyRecord[]) {
  const submitted = records.filter((record) => record.status === "submitted");
  const submittedRecords = submitted.length;
  const completedRecords = submitted.filter((record) => record.completed >= record.total).length;
  const completionRate = submittedRecords > 0 ? Math.round((completedRecords / submittedRecords) * 100) : 0;
  const onTimeRecords = submitted.filter(isWorkflowRecordOnTime).length;
  const totalChecklist = submitted.reduce((sum, record) => sum + record.total, 0);
  const completedChecklist = submitted.reduce((sum, record) => sum + record.completed, 0);
  return { submittedRecords, completedRecords, completionRate, onTimeRecords, totalChecklist, completedChecklist };
}

const THAI_MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
];

/** "2026-08-19" → "19 ส.ค. 69" — no Date parsing, so no timezone drift. */
export function formatThaiDayLabel(workDate: string): string {
  const [year, month, day] = workDate.split("-").map((part) => Number(part));
  if (!year || !month || !day) return workDate;
  const monthLabel = THAI_MONTHS[month - 1] ?? String(month);
  const buddhistShortYear = String((year + 543) % 100).padStart(2, "0");
  return `${day} ${monthLabel} ${buddhistShortYear}`;
}
