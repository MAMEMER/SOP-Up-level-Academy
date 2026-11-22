import "server-only";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import { hasStoreHubCreds, storeHubGet } from "./storehub-api.ts";
import { isPeriod } from "./peer-review.ts";
import { fetchAllWorkProjects } from "./work-projects-server-store.ts";
import { getPersonTargets, getTeachLogs } from "./kpi-v2-person-store.ts";
import { personNumbers, type PersonNumbers } from "./kpi-v2-person-numbers.ts";
import { salesByStaff, type SaleProduct, type SaleTransaction } from "./kpi-v2-sales.ts";

const stores = new Set(["6a268170c008ab000760e21a", "6aaa02f0a568500007542756"]);
const delay = () => new Promise((resolve) => setTimeout(resolve, 350));
let queue: Promise<void> = Promise.resolve();
const salesCache = new Map<string, { at: number; value: Promise<Record<string, number>> }>();

function salesForPeriod(period: string): Promise<Record<string, number>> {
  const cached = salesCache.get(period);
  if (cached && Date.now() - cached.at < 60000) return cached.value;
  const value = queue.then(() => fetchSales(period));
  queue = value.then(() => undefined, () => undefined);
  const entry = { at: Date.now(), value };
  salesCache.set(period, entry);
  value.catch(() => { if (salesCache.get(period) === entry) salesCache.delete(period); });
  return value;
}

export async function loadPersonNumbers(staffCode: string, period: string): Promise<PersonNumbers> {
  if (!isPeriod(period) || !hasAdminCredentials()) throw new Error("person_numbers_unavailable");
  const [targets, projects] = await Promise.all([getPersonTargets(period), fetchAllWorkProjects()]);
  const target = targets[staffCode] || {};
  const teachCount = target.teachTarget ? (await getTeachLogs(period)).filter((log) => log.staffCode === staffCode).length : undefined;
  if (!target.addonSalesTarget) return personNumbers(staffCode, period, { teachCount, targets: target, projects });
  if (!hasStoreHubCreds()) throw new Error("storehub_unavailable");
  const sales = await salesForPeriod(period);
  return personNumbers(staffCode, period, { teachCount, addonSales: sales[staffCode] || 0, targets: target, projects });
}

async function fetchSales(period: string): Promise<Record<string, number>> {
  const [year, month] = period.split("-").map(Number);
  const from = Date.UTC(year, month - 1, 1) - 7 * 3600000, to = Date.UTC(year, month, 1) - 7 * 3600000;
  await delay();
  const employees = await storeHubGet<{ id?: string; email?: string }[]>("/employees");
  if (!Array.isArray(employees) || !employees.length) throw new Error("missing_employees");
  await delay();
  const products = await storeHubGet<SaleProduct[]>("/products");
  if (!Array.isArray(products) || !products.length) throw new Error("missing_products");
  const staff = await adminDb().collection("sop_staff").get();
  const emails = new Map(staff.docs.filter((doc) => doc.data().active !== false && doc.data().code && doc.data().displayName).map((doc) => [doc.id.toLowerCase(), String(doc.data().code)]));
  const cashiers: Record<string, string> = {};
  for (const employee of employees) { const code = emails.get(String(employee.email || "").toLowerCase()); if (employee.id && code) cashiers[employee.id] = code; }
  const transactions: SaleTransaction[] = [];
  for (const store of stores) for (let start = from; start < to; start += 5 * 86400000) {
    await delay();
    const end = Math.min(start + 5 * 86400000, to);
    const query = new URLSearchParams({ storeId: store, from: new Date(start).toISOString(), to: new Date(end).toISOString() });
    const result = await storeHubGet<SaleTransaction[]>(`/transactions?${query}`);
    if (!Array.isArray(result)) throw new Error("invalid_transactions");
    transactions.push(...result);
  }
  return salesByStaff(transactions, products, cashiers, from, to, stores);
}
