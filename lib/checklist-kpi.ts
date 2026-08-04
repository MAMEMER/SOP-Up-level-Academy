import "server-only";
import { employeeCodeForEmail } from "./employee-directory.ts";
import { listAllRecordsInScopeRange } from "./work-records-store.ts";
import { dailyScopeKey } from "./work-records.ts";
import { isWorkflowRecordOnTime, type WorkflowDayPayload } from "./workflow-records.ts";

// Feeds the KPI "Checklist" category from the real submitted records. Before this the
// category ran off a hardcoded fixture list of four missing days, which meant a live
// salary-deduction score was being computed from test data.

export type ChecklistDay = { employeeName: string; workDate: string };
export type ChecklistLateSubmission = { employeeName: string; workDate: string; phaseId: string };

export type ChecklistKpiInput = {
  /** days where at least one phase was submitted — a scheduled day missing here is a missing_day */
  submittedDays: ChecklistDay[];
  /** each หัวข้อ handed in after its own deadline — 2 points each */
  lateSubmissions: ChecklistLateSubmission[];
};

/**
 * Reads the submitted checklist records for the period once and derives both KPI inputs:
 * which days were worked on at all, and which หัวข้อ were handed in late. Lateness is read
 * off the record itself (submittedAt vs the dueAt stored when it was submitted), so a
 * later change to a phase's deadline never re-scores a day that already closed.
 */
export async function fetchChecklistKpiInput(branch: string, startDate: string, endDate: string): Promise<ChecklistKpiInput> {
  const docs = await listAllRecordsInScopeRange(dailyScopeKey(startDate), dailyScopeKey(endDate));
  const submittedDays: ChecklistDay[] = [];
  const lateSubmissions: ChecklistLateSubmission[] = [];

  for (const doc of docs) {
    if (doc.scope !== "daily" || doc.branch !== branch) continue;
    const employeeName = employeeCodeForEmail(doc.employeeEmail);
    if (!employeeName) continue;

    const records = (doc.data as Partial<WorkflowDayPayload>)?.records || [];
    for (const record of records) {
      if (record.status !== "submitted") continue;
      if (!submittedDays.some((day) => day.employeeName === employeeName && day.workDate === record.workDate)) {
        submittedDays.push({ employeeName, workDate: record.workDate });
      }
      if (record.submittedAt && record.dueAt && !isWorkflowRecordOnTime(record)) {
        lateSubmissions.push({ employeeName, workDate: record.workDate, phaseId: record.phaseId });
      }
    }
  }

  return { submittedDays, lateSubmissions };
}

/**
 * Days where the employee actually submitted at least one checklist phase. The KPI side
 * inverts this: a scheduled + clocked-in day that is NOT in this list is a missing_day.
 */
export async function fetchSubmittedChecklistDays(branch: string, startDate: string, endDate: string): Promise<ChecklistDay[]> {
  return (await fetchChecklistKpiInput(branch, startDate, endDate)).submittedDays;
}
