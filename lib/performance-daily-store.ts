import "server-only";
import { fetchPerformanceDailyStore as fetchManualRecords, type PerformanceDailyStore } from "./performance-service-records.ts";
import { fetchStockCheckRecords } from "./stock-check-store.ts";

/**
 * Every manual KPI input in one object.
 *
 * Complaint and assigned-work records go through the public REST key; stock checks need
 * the service account (the shared firestore.rules do not open their collection). This
 * composer is where the two meet, so lib/performance-service-records.ts can stay free of
 * "server-only" and keep its record helpers unit-testable.
 */
export async function fetchPerformanceDailyStore(): Promise<PerformanceDailyStore> {
  const [manual, stockCheckRecords] = await Promise.all([fetchManualRecords(), fetchStockCheckRecords()]);
  return { ...manual, stockCheckRecords };
}
