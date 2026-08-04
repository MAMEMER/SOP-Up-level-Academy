import "server-only";
import { fetchPerformanceDailyStore as fetchManualRecords, type PerformanceDailyStore } from "./performance-service-records.ts";
import { fetchStockCheckRecords } from "./stock-check-store.ts";
import { fetchChecklistAuditRecords } from "./checklist-audit-store.ts";
import { fetchScoreAdjustments } from "./score-adjustment-store.ts";
import { fetchKpiRules } from "./kpi-rules-store.ts";

/**
 * Every manual KPI input in one object.
 *
 * Complaint and assigned-work records go through the public REST key; stock checks and
 * checklist audits need the service account (the shared firestore.rules do not open their
 * collections). This composer is where they meet, so lib/performance-service-records.ts can
 * stay free of "server-only" and keep its record helpers unit-testable.
 */
export async function fetchPerformanceDailyStore(): Promise<PerformanceDailyStore> {
  const [manual, stockCheckRecords, checklistAuditRecords, scoreAdjustments, kpiRules] = await Promise.all([
    fetchManualRecords(),
    fetchStockCheckRecords(),
    fetchChecklistAuditRecords(),
    fetchScoreAdjustments(),
    fetchKpiRules()
  ]);
  return { ...manual, stockCheckRecords, checklistAuditRecords, scoreAdjustments, kpiRules };
}
