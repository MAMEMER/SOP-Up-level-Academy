import "server-only";
import { listAllRecordsInScopeRange, listRecordsForScopeKey, storageMode } from "./work-records-store.ts";
import { dailyScopeKey, monthlyScopeKey, weeklyScopeKey, type WorkRecordDoc } from "./work-records.ts";
import { isoWeekKey } from "./periodic-tasks.ts";
import { recordsFromDayPayloads, type WorkflowDailyRecord, type WorkflowDayPayload } from "./workflow-records.ts";
import { cardStoreWorkflow } from "./card-store-workflow.ts";
import { fetchAssignmentsForDate, fetchOpenHandoffs, type WorkAssignment, type WorkHandoff } from "./work-assignments-store.ts";
import { customerServiceRecordsForDate, type CustomerServiceRecord } from "./performance-service-records.ts";
import { monthlyTasks } from "./monthly-event-tasks.ts";
import { weeklyEvents } from "./weekly-event-tasks.ts";
import { employeeDirectory } from "./employee-directory.ts";
import { fetchPerformanceDailyStore } from "./performance-daily-store.ts";

// Everything the owner dashboard shows, read straight from the records staff actually
// write. No fixtures: if a number is not backed by a real source it is not on the page.

export type StaffDaySummary = {
  employeeName: string;
  employeeEmail: string;
  /** phases this person has a record for today */
  records: WorkflowDailyRecord[];
  completed: number;
  total: number;
  submittedPhases: number;
  latePhases: number;
};

export type OpsSummary = {
  workDate: string;
  storageReady: boolean;
  staff: StaffDaySummary[];
  /** roster members with no record at all today */
  noRecordStaff: string[];
  daily: { completed: number; total: number; submittedPhases: number; latePhases: number; phaseCount: number };
  assignments: WorkAssignment[];
  handoffs: WorkHandoff[];
  serviceIssues: CustomerServiceRecord[];
  weekly: { periodKey: string; stockTicks: number; eventTicks: number; eventTotal: number };
  monthly: { monthKey: string; done: number; inProgress: number; total: number };
};

function dayPayloads(docs: WorkRecordDoc[]) {
  return recordsFromDayPayloads(docs.map((doc) => doc.data as Partial<WorkflowDayPayload>));
}

function countTicks(data: Record<string, unknown> | undefined, key: string) {
  const map = (data?.[key] || {}) as Record<string, unknown>;
  return Object.values(map).filter(Boolean).length;
}

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

export async function getOpsSummary(workDate: string, branch = "bangkae"): Promise<OpsSummary> {
  const phaseCount = cardStoreWorkflow.filter((phase) => phase.checklist.length > 0).length;
  const monthKey = workDate.slice(0, 7);
  const periodKey = isoWeekKey(workDate);

  if (storageMode() === "unavailable") {
    return {
      workDate,
      storageReady: false,
      staff: [],
      noRecordStaff: [],
      daily: { completed: 0, total: 0, submittedPhases: 0, latePhases: 0, phaseCount },
      assignments: [],
      handoffs: [],
      serviceIssues: [],
      weekly: { periodKey, stockTicks: 0, eventTicks: 0, eventTotal: 0 },
      monthly: { monthKey, done: 0, inProgress: 0, total: monthlyTasks.length }
    };
  }

  const [dayDocs, weekDocs, monthDocs, assignments, handoffs, dailyStore] = await Promise.all([
    safe(() => listRecordsForScopeKey(dailyScopeKey(workDate)), [] as WorkRecordDoc[]),
    safe(() => listAllRecordsInScopeRange(weeklyScopeKey(periodKey), `${weeklyScopeKey(periodKey)}-event`), [] as WorkRecordDoc[]),
    safe(() => listRecordsForScopeKey(monthlyScopeKey(monthKey)), [] as WorkRecordDoc[]),
    safe(() => fetchAssignmentsForDate(branch, workDate), [] as WorkAssignment[]),
    safe(() => fetchOpenHandoffs(branch), [] as WorkHandoff[]),
    safe(() => fetchPerformanceDailyStore(), { serviceRecords: [], assignedWorkRecords: [], stockCheckRecords: [] })
  ]);

  const staff: StaffDaySummary[] = dayDocs
    .map((doc) => {
      const records = dayPayloads([doc]).filter((record) => record.workDate === workDate);
      return {
        employeeName: doc.employeeName || doc.employeeEmail,
        employeeEmail: doc.employeeEmail,
        records,
        completed: records.reduce((sum, record) => sum + record.completed, 0),
        total: records.reduce((sum, record) => sum + record.total, 0),
        submittedPhases: records.filter((record) => record.status === "submitted").length,
        latePhases: records.filter((record) => record.status === "missed").length
      };
    })
    .filter((entry) => entry.records.length > 0)
    .sort((left, right) => left.employeeName.localeCompare(right.employeeName, "th"));

  const seen = new Set(staff.map((entry) => entry.employeeEmail.toLowerCase()));
  const noRecordStaff = employeeDirectory
    .filter((entry) => entry.branch === branch && !seen.has((entry.email || "").toLowerCase()))
    .map((entry) => entry.displayName);

  const stockDoc = weekDocs.find((doc) => doc.scopeKey === weeklyScopeKey(periodKey));
  const eventDoc = weekDocs.find((doc) => doc.scopeKey === `${weeklyScopeKey(periodKey)}-event`);
  const eventTotal = weeklyEvents.reduce((sum, event) => sum + event.checklist.length, 0);

  const monthStates = (monthDocs[0]?.data?.states || {}) as Record<string, string>;
  const monthValues = Object.values(monthStates);

  return {
    workDate,
    storageReady: true,
    staff,
    noRecordStaff,
    daily: {
      completed: staff.reduce((sum, entry) => sum + entry.completed, 0),
      total: staff.reduce((sum, entry) => sum + entry.total, 0),
      submittedPhases: staff.reduce((sum, entry) => sum + entry.submittedPhases, 0),
      latePhases: staff.reduce((sum, entry) => sum + entry.latePhases, 0),
      phaseCount
    },
    assignments,
    handoffs,
    serviceIssues: customerServiceRecordsForDate(dailyStore.serviceRecords, workDate),
    weekly: {
      periodKey,
      stockTicks: countTicks(stockDoc?.data, "checked") + countTicks(stockDoc?.data, "ticks"),
      eventTicks: countTicks(eventDoc?.data, "ticks"),
      eventTotal
    },
    monthly: {
      monthKey,
      done: monthValues.filter((state) => state === "done").length,
      inProgress: monthValues.filter((state) => state === "in_progress" || state === "submitted").length,
      total: monthlyTasks.length
    }
  };
}

/** Every employee's submitted records for a month — the owner's monthly rollup. */
export async function getMonthlyTeamRecords(monthKey: string): Promise<WorkflowDailyRecord[]> {
  if (storageMode() === "unavailable") return [];
  // scope keys sort lexically, so "-01" .. "-31" covers the month whatever its length
  const docs = await safe(
    () => listAllRecordsInScopeRange(dailyScopeKey(`${monthKey}-01`), dailyScopeKey(`${monthKey}-31`)),
    [] as WorkRecordDoc[]
  );
  return dayPayloads(docs);
}
