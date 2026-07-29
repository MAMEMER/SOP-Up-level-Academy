import "server-only";
import { employeeCodeForEmail } from "./employee-directory.ts";
import { listAllRecordsInScopeRange } from "./work-records-store.ts";
import { dailyScopeKey } from "./work-records.ts";
import type { WorkflowDayPayload } from "./workflow-records.ts";

// Feeds the KPI "Checklist" category from the real submitted records. Before this the
// category ran off a hardcoded fixture list of four missing days, which meant a live
// salary-deduction score was being computed from test data.

export type ChecklistDay = { employeeName: string; workDate: string };

/**
 * Days where the employee actually submitted at least one checklist phase. The KPI side
 * inverts this: a scheduled + clocked-in day that is NOT in this list is a missing_day.
 */
export async function fetchSubmittedChecklistDays(branch: string, startDate: string, endDate: string): Promise<ChecklistDay[]> {
  const docs = await listAllRecordsInScopeRange(dailyScopeKey(startDate), dailyScopeKey(endDate));
  const days: ChecklistDay[] = [];

  for (const doc of docs) {
    if (doc.scope !== "daily" || doc.branch !== branch) continue;
    const employeeName = employeeCodeForEmail(doc.employeeEmail);
    if (!employeeName) continue;

    const records = (doc.data as Partial<WorkflowDayPayload>)?.records || [];
    for (const record of records) {
      if (record.status !== "submitted") continue;
      if (days.some((day) => day.employeeName === employeeName && day.workDate === record.workDate)) continue;
      days.push({ employeeName, workDate: record.workDate });
    }
  }

  return days;
}
