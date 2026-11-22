import "server-only";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import { hasStoreHubCreds, storeHubGet } from "./storehub-api.ts";
import { isPeriod } from "./peer-review.ts";
import { fetchAllWorkProjects } from "./work-projects-server-store.ts";
import { getGrowthPct, getPersonTargets, getTeachLogs } from "./kpi-v2-person-store.ts";
import { personNumbers, type PersonNumbers } from "./kpi-v2-person-numbers.ts";
import { saleRows, salesTargets, type SaleProduct, type SaleTransaction, type Shift } from "./kpi-v2-sales.ts";
import { isWorkingAssignment, type ShiftAssignment } from "./shift-schedule.ts";
const stores: Record<string, string> = { "6a268170c008ab000760e21a": "bangkae", "6aaa02f0a568500007542756": "senafest" };
const delay = () => new Promise(resolve => setTimeout(resolve, 350));
let queue: Promise<void> = Promise.resolve();
const cache = new Map<string, { at: number; value: Promise<Awaited<ReturnType<typeof fetchSales>>> }>();
function salesForPeriod(period: string) { const cached = cache.get(period); if (cached && Date.now() - cached.at < 60000) return cached.value; const value = queue.then(() => fetchSales(period)); queue = value.then(() => undefined, () => undefined); const entry = { at: Date.now(), value }; cache.set(period, entry); value.catch(() => { if (cache.get(period) === entry) cache.delete(period); }); return value; }
export async function loadSalesOverview(period: string) {
  if (!isPeriod(period) || !hasAdminCredentials() || !hasStoreHubCreds()) throw new Error("sales_unavailable");
  const [rows, snapshot, growthPct] = await Promise.all([salesForPeriod(period), adminDb().collection("schedule_shifts").get(), getGrowthPct(period)]);
  const shifts: Shift[] = snapshot.docs.map(doc => doc.data()).filter(d => d.assignment && isWorkingAssignment(d.assignment as ShiftAssignment) && d.staffCode && d.workDate && d.branch).map(d => ({ staffCode: String(d.staffCode), workDate: String(d.workDate), branch: String(d.branch) }));
  const result = salesTargets(shifts, rows, period, growthPct);
  const sales: Record<string, number> = {}; let unnamed = 0, openPrice = 0, storeRevenue = 0;
  for (const row of rows) if (row.workDate.startsWith(period)) { openPrice += row.openPrice || 0; storeRevenue += row.storeRevenue || 0; if (row.staffCode) sales[row.staffCode] = (sales[row.staffCode] || 0) + row.amount; else unnamed += row.amount; }
  return { ...result, sales, unnamed, openPrice, storeRevenue, growthPct };
}
async function referralCounts(collection: string, period: string, staffCode: string, members: boolean): Promise<number | undefined> {
  const snapshot = await adminDb().collection(collection).where("referredByStaff", "==", staffCode).get();
  const [year, month] = period.split("-").map(Number);
  const from = Date.UTC(year, month - 1, 1) - 7 * 3600000, to = Date.UTC(year, month, 1) - 7 * 3600000;
  let present = false, count = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const raw = data.createdAt;
    const at = typeof raw === "string" ? Date.parse(raw) : raw?.toDate?.().getTime();
    if (!Number.isFinite(at) || at < from || at >= to) continue;
    present = true;
    if (!members || (data.tier && data.status === "active") || data.isLegacyLinked) count++;
  }
  return present ? count : undefined;
}
export async function loadPersonNumbers(staffCode: string, period: string): Promise<PersonNumbers> {
  if (!isPeriod(period) || !hasAdminCredentials()) throw new Error("person_numbers_unavailable");
  const [targets, projects, logs, overview, members, eventCustomers] = await Promise.all([getPersonTargets(period), fetchAllWorkProjects(), getTeachLogs(period), loadSalesOverview(period).catch(() => undefined), referralCounts("users", period, staffCode, true).catch(() => undefined), referralCounts("event_signup_branches", period, staffCode, false).catch(() => undefined)]);
  const target = targets[staffCode] || {};
  return personNumbers(staffCode, period, { teachCount: logs.filter(log => log.staffCode === staffCode).length, productSales: overview ? overview.sales[staffCode] || 0 : undefined, productTarget: overview?.people[staffCode]?.target, members, eventCustomers, targets: target, projects });
}
async function fetchSales(period: string) {
  const [year, month] = period.split("-").map(Number);
  const first = Date.UTC(year, month - 1, 1) - 7 * 3600000, from = first - 56 * 86400000, to = Date.UTC(year, month, 1) - 7 * 3600000;
  await delay(); const employees = await storeHubGet<{ id?: string; email?: string; firstName?: string }[]>("/employees");
  if (!Array.isArray(employees) || !employees.length) throw new Error("missing_employees");
  await delay(); const products = await storeHubGet<SaleProduct[]>("/products");
  if (!Array.isArray(products) || !products.length) throw new Error("missing_products");
  const staff = await adminDb().collection("sop_staff").get();
  const emails = new Map(staff.docs.filter(doc => doc.data().active !== false && doc.data().code && doc.data().displayName).map(doc => [doc.id.toLowerCase(), String(doc.data().code)]));
  const cashiers: Record<string, string> = {};
  for (const employee of employees) { const code = emails.get(String(employee.email || "").toLowerCase()); if (employee.id && code && String(employee.firstName || "").trim().toLowerCase() !== "uplevel") cashiers[employee.id] = code; }
  const transactions: SaleTransaction[] = [];
  for (const store of Object.keys(stores)) for (let start = from; start < to; start += 5 * 86400000) { await delay(); const query = new URLSearchParams({ storeId: store, from: new Date(start).toISOString(), to: new Date(Math.min(start + 5 * 86400000, to)).toISOString() }); const result = await storeHubGet<SaleTransaction[]>(`/transactions?${query}`); if (!Array.isArray(result)) throw new Error("invalid_transactions"); transactions.push(...result); }
  const known = new Set(products.map(product => product.id));
  const missing = [...new Set(transactions.flatMap(t => (t.items || []).map(item => item.productId).filter((id): id is string => !!id && !known.has(id))))];
  const productCache = adminDb().collection("sop_storehub_product_cache");
  for (const id of missing) {
    const ref = productCache.doc(id);
    const cached = await ref.get();
    let product = cached.exists ? cached.data() as SaleProduct : undefined;
    if (!product) {
      await delay();
      product = await storeHubGet<SaleProduct>(`/products/${encodeURIComponent(id)}`);
      if (!product || product.id !== id || (!product.name && !product.category)) throw new Error("invalid_product");
      await ref.set({ id, name: product.name || "", category: product.category || "" });
    }
    products.push(product);
  }
  return saleRows(transactions, products, cashiers, from, to, stores);
}
