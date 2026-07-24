import { effectiveAssignedWorkStatus } from "./assigned-work-status.ts";
import type { AssignedWork, ServiceEvent } from "./performance-score.ts";
import { restListCollection, restUpsertDoc } from "./firestore-rest.ts";

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
};

export type AssignedWorkRecordInput = Omit<AssignedWorkRecord, "id" | "recordedAt">;

export type PerformanceDailyStore = {
  serviceRecords: CustomerServiceRecord[];
  assignedWorkRecords: AssignedWorkRecord[];
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
  const [serviceRecords, assignedWorkRecords] = await Promise.all([
    restListCollection<CustomerServiceRecord>(SERVICE_COLLECTION),
    restListCollection<AssignedWorkRecord>(ASSIGNED_COLLECTION)
  ]);
  return { serviceRecords, assignedWorkRecords };
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
