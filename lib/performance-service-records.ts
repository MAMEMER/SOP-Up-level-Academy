import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AssignedWork, ServiceEvent } from "./performance-score.ts";

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
  recordedAt: string;
};

export type AssignedWorkRecordInput = Omit<AssignedWorkRecord, "id" | "recordedAt">;

export type PerformanceDailyStore = {
  serviceRecords: CustomerServiceRecord[];
  assignedWorkRecords: AssignedWorkRecord[];
};

const emptyStore: PerformanceDailyStore = { serviceRecords: [], assignedWorkRecords: [] };
const storePath = join(process.cwd(), ".data", "performance-daily-records.json");

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
  teamAssignment?: { teamAssigneeName: string; teamMembers: string[] }
) {
  return records
    .filter((record) => record.title)
    .flatMap((record) => {
      const employeeNames = teamAssignment && record.employeeName === teamAssignment.teamAssigneeName
        ? teamAssignment.teamMembers
        : [record.employeeName];
      return employeeNames.map((employeeName) => ({
        employeeName,
        work: { title: record.title, status: record.status, source: "manual" as const }
      }));
    })
    .sort((left, right) => `${left.employeeName}:${left.work.title}`.localeCompare(`${right.employeeName}:${right.work.title}`));
}

export function readPerformanceDailyStore(): PerformanceDailyStore {
  if (!existsSync(storePath)) return emptyStore;
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return {
      serviceRecords: Array.isArray(parsed.serviceRecords) ? parsed.serviceRecords : [],
      assignedWorkRecords: Array.isArray(parsed.assignedWorkRecords) ? parsed.assignedWorkRecords : []
    };
  } catch {
    return emptyStore;
  }
}

export function writePerformanceDailyStore(store: PerformanceDailyStore) {
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export function saveCustomerServiceRecord(input: CustomerServiceRecordInput) {
  const store = readPerformanceDailyStore();
  const next = { ...store, serviceRecords: addCustomerServiceRecord(store.serviceRecords, input) };
  writePerformanceDailyStore(next);
  return next;
}

export function saveAssignedWorkRecord(input: AssignedWorkRecordInput) {
  const store = readPerformanceDailyStore();
  const next = { ...store, assignedWorkRecords: addAssignedWorkRecord(store.assignedWorkRecords, input) };
  writePerformanceDailyStore(next);
  return next;
}
