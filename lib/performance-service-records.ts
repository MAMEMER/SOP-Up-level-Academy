import { effectiveAssignedWorkStatus } from "./assigned-work-status.ts";
import type { AssignedWork, ServiceEvent } from "./performance-score.ts";
import { restListCollection, restUpsertDoc } from "./firestore-rest.ts";
import type { StockCheckRecord } from "./stock-check-records.ts";

const SERVICE_COLLECTION = "sop_service_records";
const ASSIGNED_COLLECTION = "sop_assigned_records";

export type CustomerServiceRecord = {
  id: string;
  workDate: string;
  employeeName: string;
  bucket: ServiceEvent["bucket"];
  severity: ServiceEvent["severity"];
  count: number;
  note: string;
  /** URL or note pointing to proof (screenshot / chat link) */
  evidence?: string;
  recordedAt: string;
};

export type CustomerServiceRecordInput = Omit<CustomerServiceRecord, "id" | "recordedAt">;

export type AssignedWorkRecord = {
  id: string;
  workDate: string;
  employeeName: string;
  title: string;
  status: AssignedWork["status"];
  note: string;
  /** URL or note pointing to proof (screenshot / chat link) */
  evidence?: string;
  trackingNumber?: string;
  imageEvidence?: string[];
  recordedAt: string;
  submittedAt?: string;
  updatedAt?: string;
  // Multi-assign grouping (ticket S3JjyiwLxyHLpPn6uOyX): when the same task is handed to
  // several named staff at once, each person still gets their OWN record (so each is scored
  // independently on how THEY did it) but they share a groupId so the UI can show them as one
  // task and the owner can tell "งานเดียวกันมอบหลายคน" apart from unrelated same-title records.
  // Absent on single-assignee records and on legacy "ทีม บางแค" team records.
  groupId?: string;
  /** how many staff the shared task was handed to (only set on grouped records) */
  assigneeCount?: number;
};

export type AssignedWorkRecordInput = Omit<AssignedWorkRecord, "id" | "recordedAt">;

export type PerformanceDailyStore = {
  serviceRecords: CustomerServiceRecord[];
  assignedWorkRecords: AssignedWorkRecord[];
  /** owner-entered stock checks — the input for the Stock KPI category */
  stockCheckRecords: StockCheckRecord[];
};

function recordId(prefix: string, input: { workDate: string; employeeName: string }, recordedAt: string) {
  return `${prefix}-${input.workDate}-${input.employeeName}-${recordedAt}`.replace(/[^a-zA-Z0-9-]/g, "-");
}

export function addCustomerServiceRecord(records: CustomerServiceRecord[], input: CustomerServiceRecordInput, recordedAt = new Date().toISOString()) {
  return [
    ...records,
    {
      ...input,
      count: Math.max(1, Math.round(input.count || 1)),
      note: input.note.trim(),
      evidence: (input.evidence || "").trim() || undefined,
      recordedAt,
      id: recordId("service", input, recordedAt)
    }
  ];
}

export function addAssignedWorkRecord(records: AssignedWorkRecord[], input: AssignedWorkRecordInput, recordedAt = new Date().toISOString()) {
  return [
    ...records,
    {
      ...input,
      title: input.title.trim(),
      note: input.note.trim(),
      evidence: (input.evidence || "").trim() || undefined,
      trackingNumber: (input.trackingNumber || "").trim() || undefined,
      imageEvidence: input.imageEvidence?.filter(Boolean),
      recordedAt,
      id: recordId("assigned", input, recordedAt)
    }
  ];
}

/**
 * Assign one shared task to several named staff at once (ticket S3JjyiwLxyHLpPn6uOyX).
 *
 * Old behaviour forced a choice with no middle ground: either the "ทีม บางแค" sentinel
 * (which fans out to EVERY Bangkae member and gives them all one identical status) or
 * re-submitting the form per person (which produced disconnected records the system could
 * not tell were the same task). This writes one record PER selected person — so each is
 * scored independently on their own completion — while stamping a shared groupId so the batch
 * stays recognisable as a single task. A single-name call behaves exactly like the old
 * addAssignedWorkRecord (no groupId).
 */
export function addAssignedWorkRecords(
  records: AssignedWorkRecord[],
  input: Omit<AssignedWorkRecordInput, "employeeName" | "groupId" | "assigneeCount"> & { employeeNames: string[] },
  recordedAt = new Date().toISOString()
): AssignedWorkRecord[] {
  const { employeeNames, ...rest } = input;
  const uniqueNames = [...new Set(employeeNames.map((name) => name.trim()).filter(Boolean))];
  if (uniqueNames.length === 0) return records;
  const shared =
    uniqueNames.length > 1
      ? {
          groupId: `agrp-${rest.workDate}-${rest.title}-${recordedAt}`.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 140),
          assigneeCount: uniqueNames.length
        }
      : {};
  return uniqueNames.reduce(
    (acc, employeeName) => addAssignedWorkRecord(acc, { ...rest, employeeName, ...shared }, recordedAt),
    records
  );
}

export function customerServiceRecordsForDate(records: CustomerServiceRecord[], workDate: string) {
  return records.filter((record) => record.workDate === workDate);
}

export function assignedWorkRecordsForDate(records: AssignedWorkRecord[], workDate: string) {
  return records.filter((record) => record.workDate === workDate);
}

export function assignedWorkRecordById(records: AssignedWorkRecord[], id: string) {
  return records.find((record) => record.id === id) || null;
}

export function customerServiceRecordsToEvents(records: CustomerServiceRecord[]) {
  const grouped = new Map<string, { employeeName: string; event: ServiceEvent }>();
  records.forEach((record) => {
    const key = `${record.employeeName}:${record.bucket}:${record.severity}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.event.count += record.count;
      return;
    }
    grouped.set(key, {
      employeeName: record.employeeName,
      event: { bucket: record.bucket, severity: record.severity, count: record.count, source: "manual" }
    });
  });
  return [...grouped.values()].sort((left, right) => `${left.employeeName}:${left.event.bucket}`.localeCompare(`${right.employeeName}:${right.event.bucket}`));
}

export function assignedWorkRecordsToWorks(
  records: AssignedWorkRecord[],
  teamAssignment?: { teamAssigneeName: string; teamMembers: string[] },
  now = new Date()
) {
  return records
    .filter((record) => record.title)
    .flatMap((record) => {
      const employeeNames = teamAssignment && record.employeeName === teamAssignment.teamAssigneeName
        ? teamAssignment.teamMembers
        : [record.employeeName];
      return employeeNames.map((employeeName) => ({
        employeeName,
        work: { title: record.title, status: effectiveAssignedWorkStatus(record, now), source: "manual" as const }
      }));
    })
    .sort((left, right) => `${left.employeeName}:${left.work.title}`.localeCompare(`${right.employeeName}:${right.work.title}`));
}

export function updateAssignedWorkRecords(
  records: AssignedWorkRecord[],
  id: string,
  input: { status?: AssignedWork["status"]; note: string; evidence?: string; trackingNumber?: string; imageEvidence?: string[] },
  recordedAt = new Date().toISOString()
): { records: AssignedWorkRecord[]; record: AssignedWorkRecord | null } {
  let updatedRecord: AssignedWorkRecord | null = null;
  const nextRecords = records.map((record) => {
    if (record.id !== id) return record;
    updatedRecord = {
      ...record,
      status: input.status || record.status,
      note: input.note.trim(),
      evidence: (input.evidence || "").trim() || undefined,
      trackingNumber: (input.trackingNumber || "").trim() || undefined,
      imageEvidence: input.imageEvidence?.filter(Boolean),
      submittedAt: recordedAt,
      updatedAt: recordedAt
    };
    return updatedRecord;
  });
  return { records: nextRecords, record: updatedRecord };
}

// Records now persist in Firestore (sop_service_records / sop_assigned_records) so
// they survive Vercel cold starts — the old local-JSON store was ephemeral there.
export async function fetchPerformanceDailyStore(): Promise<PerformanceDailyStore> {
  // Stock checks are written with the service account, so they are fetched by the
  // server-only composer in lib/performance-daily-store.ts. Keeping that import out of
  // this module lets the record helpers here stay unit-testable.
  const [serviceRecords, assignedWorkRecords] = await Promise.all([
    restListCollection<CustomerServiceRecord>(SERVICE_COLLECTION),
    restListCollection<AssignedWorkRecord>(ASSIGNED_COLLECTION)
  ]);
  return { serviceRecords, assignedWorkRecords, stockCheckRecords: [] };
}

export async function saveCustomerServiceRecord(input: CustomerServiceRecordInput) {
  const record = addCustomerServiceRecord([], input)[0];
  await restUpsertDoc(SERVICE_COLLECTION, record.id, {
    id: record.id,
    workDate: record.workDate,
    employeeName: record.employeeName,
    bucket: record.bucket,
    severity: record.severity,
    count: record.count,
    note: record.note,
    evidence: record.evidence,
    recordedAt: record.recordedAt
  });
  return record;
}

export async function saveAssignedWorkRecord(input: AssignedWorkRecordInput) {
  const record = addAssignedWorkRecord([], input)[0];
  await restUpsertDoc(ASSIGNED_COLLECTION, record.id, {
    id: record.id,
    workDate: record.workDate,
    employeeName: record.employeeName,
    title: record.title,
    status: record.status,
    note: record.note,
    evidence: record.evidence,
    recordedAt: record.recordedAt
  });
  return record;
}

/**
 * Persist a shared task assigned to one or more staff (ticket S3JjyiwLxyHLpPn6uOyX).
 * Writes one Firestore doc per selected person, linked by a shared groupId when >1.
 */
export async function saveAssignedWorkRecords(
  input: Omit<AssignedWorkRecordInput, "employeeName" | "groupId" | "assigneeCount"> & { employeeNames: string[] }
) {
  const created = addAssignedWorkRecords([], input);
  await Promise.all(
    created.map((record) =>
      restUpsertDoc(ASSIGNED_COLLECTION, record.id, {
        id: record.id,
        workDate: record.workDate,
        employeeName: record.employeeName,
        title: record.title,
        status: record.status,
        note: record.note,
        evidence: record.evidence,
        groupId: record.groupId,
        assigneeCount: record.assigneeCount,
        recordedAt: record.recordedAt
      })
    )
  );
  return created;
}

export async function updateAssignedWorkRecordSubmission(
  id: string,
  input: { status?: AssignedWork["status"]; note: string; evidence?: string; trackingNumber?: string; imageEvidence?: string[] },
  recordedAt = new Date().toISOString()
) {
  const store = await fetchPerformanceDailyStore();
  const updated = updateAssignedWorkRecords(store.assignedWorkRecords, id, input, recordedAt);
  if (!updated.record) return { store, record: null };

  await restUpsertDoc(ASSIGNED_COLLECTION, updated.record.id, {
    id: updated.record.id,
    workDate: updated.record.workDate,
    employeeName: updated.record.employeeName,
    title: updated.record.title,
    status: updated.record.status,
    note: updated.record.note,
    evidence: updated.record.evidence,
    trackingNumber: updated.record.trackingNumber,
    imageEvidence: updated.record.imageEvidence,
    submittedAt: updated.record.submittedAt,
    updatedAt: updated.record.updatedAt,
    recordedAt: updated.record.recordedAt
  });
  const next = { ...store, assignedWorkRecords: updated.records };
  return { store: next, record: updated.record };
}
