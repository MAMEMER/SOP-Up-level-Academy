import "server-only";
import { adminDb } from "./firebase-admin.ts";
import { hasStoreHubCreds, storeHubGet } from "./storehub-api.ts";
import { calculateActuals, salesProgress, monthWeeks, passedWeeks, group4Score, type OnlinePayment, type Product, type TeamTargets, type Transaction, type StoreNumbers } from "./team-targets.ts";

const COLLECTION = "sop_team_targets";
let queue = Promise.resolve();
async function limitedGet<T>(path: string): Promise<T> {
  let release!: () => void;
  const previous = queue;
  queue = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try {
    // Coordinate this integration across server instances as well as concurrent requests.
    const ref = adminDb().collection("sop_integration_limits").doc("team_targets_storehub");
    const slot = await adminDb().runTransaction(async tx => {
      const snap = await tx.get(ref);
      const scheduled = Math.max(Date.now(), Number(snap.data()?.nextRequest) || 0);
      tx.set(ref, { nextRequest: scheduled + 400 }, { merge: true });
      return scheduled;
    });
    const wait = Math.max(0, slot - Date.now());
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    return await storeHubGet<T>(path);
  } finally { release(); }
}
let productCache: { at: number; products: Product[] } | undefined;
async function products(): Promise<Product[]> {
  if (productCache && Date.now() - productCache.at < 3600000) return productCache.products;
  const rows = await limitedGet<Product[]>("/products");
  if (!Array.isArray(rows)) throw new Error("StoreHub products response invalid");
  productCache = { at: Date.now(), products: rows };
  return rows;
}
async function transactions(from: number, to: number): Promise<Transaction[]> {
  const path = `/transactions?from=${encodeURIComponent(new Date(from).toISOString())}&to=${encodeURIComponent(new Date(to - 1).toISOString())}`;
  const rows = await limitedGet<Transaction[]>(path);
  if (!Array.isArray(rows)) throw new Error("StoreHub transactions response invalid");
  if (rows.length < 5000) return rows;
  if (to - from <= 1000) throw new Error("StoreHub transaction limit reached");
  const mid = Math.floor((from + to) / 2);
  return [...await transactions(from, mid), ...await transactions(mid, to)];
}
const bangkokDate = (v: unknown): string => {
  if (!v) return "";
  const value = typeof v === "object" && "toDate" in v && typeof v.toDate === "function" ? v.toDate() : v;
  const ms = new Date(value as string | number | Date).getTime();
  return Number.isFinite(ms) ? new Date(ms + 7 * 3600000).toISOString().slice(0, 10) : "";
};
async function fetchTeamTargets(month: string) {
  const weeks = monthWeeks(month);
  if (!hasStoreHubCreds()) throw new Error("ยังไม่ได้ตั้งค่าการเชื่อมต่อ StoreHub");
  const start = Date.parse(`${month}-01T00:00:00+07:00`);
  const [year, m] = month.split("-").map(Number);
  const end = Date.UTC(year, m, 1) - 7 * 3600000;
  const db = adminDb();
  const [targetDoc, paymentsSnap, catalog, tx] = await Promise.all([
    db.collection(COLLECTION).doc(month).get(),
    db.collection("public_payments").where("status", "==", "verified").get(),
    products(), transactions(start, end)
  ]);
  const known = new Set(catalog.map(p => p.id));
  const missing = [...new Set(tx.flatMap(t => (t.items || []).map(i => i.productId).filter((id): id is string => Boolean(id) && !known.has(id))))];
  const resolved = [...catalog];
  for (const id of missing) {
    const item = await limitedGet<Product>(`/products/${encodeURIComponent(id)}`);
    if (!item || !item.id) throw new Error("StoreHub product missing");
    resolved.push(item);
  }
  const payments: OnlinePayment[] = paymentsSnap.docs.map(d => {
    const p = d.data();
    return { status: p.status, date: bangkokDate(p.manualPaidAt || p.verifiedAt || p.createdAt), amount: p.amount, eventType: p.eventType, source: p.source };
  });
  const targets = targetDoc.exists ? { ...targetDoc.data(), poolRevenuePct: targetDoc.data()?.poolRevenuePct ?? 10 } as TeamTargets : null;
  const actuals = calculateActuals(month, tx, resolved, payments);
  const passed = targets ? passedWeeks(weeks, actuals.entries, targets.eventTargets) : null;
  const revenue = Object.values(actuals.revenue).reduce((a, b) => a + b, 0);
  const configuredGames = targets ? Object.keys(targets.eventTargets).filter(g => targets.eventTargets[g as keyof typeof targets.eventTargets] > 0) : [];
  const eventWeeks = passed && configuredGames.length ? configuredGames.reduce((sum, g) => sum + passed[g as keyof typeof passed], 0) / configuredGames.length : 0;
  const group4 = targets ? group4Score(revenue, targets.revenueTarget, eventWeeks, configuredGames.length ? weeks.length : 0, targets.budgetTarget, targets.budgetActual ?? undefined) : undefined;
  const storeNumbers: StoreNumbers = group4 === undefined ? {} : { group4 };
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const progress = salesProgress(month, today, tx, resolved, payments);
  return { month, weeks, targets, actuals, passed, storeNumbers, progress };
}
const reportCache = new Map<string, { at: number; value: ReturnType<typeof fetchTeamTargets> }>();
export function loadTeamTargets(month: string) {
  const cached = reportCache.get(month);
  if (cached && Date.now() - cached.at < 60000) return cached.value;
  const value = fetchTeamTargets(month);
  reportCache.set(month, { at: Date.now(), value });
  value.catch(() => { if (reportCache.get(month)?.value === value) reportCache.delete(month); });
  return value;
}
export async function saveTeamTargets(month: string, targets: TeamTargets, by: string) {
  monthWeeks(month);
  await adminDb().collection(COLLECTION).doc(month).set({ ...targets, updatedAt: new Date().toISOString(), updatedBy: by }, { merge: true });
  reportCache.delete(month);
}

export async function loadWorkedHours(month: string, eligible: string[]) {
  const { hoursByStaffDay } = await import("./payroll-server.ts");
  const { fetchAttendanceSource } = await import("./planner-kpi.ts");
  const { MAX_PLAUSIBLE_HOURS } = await import("./payroll.ts");
  monthWeeks(month);
  const [year, m] = month.split("-").map(Number);
  const endDate = `${month}-${String(new Date(Date.UTC(year, m, 0)).getUTCDate()).padStart(2, "0")}`;
  const [days, attendance] = await Promise.all([
    hoursByStaffDay({ id: month, label: month, startDate: `${month}-01`, endDate }, limitedGet), fetchAttendanceSource()
  ]);
  const clocked = new Set(attendance.clockEvents.filter(x => x.workDate.startsWith(month)).map(x => `${x.employeeName}__${x.workDate}`));
  return eligible.map(code => ({ code, hours: [...days].filter(([key, day]) => key.startsWith(`${code}__`) && clocked.has(key) && day.hours != null && day.hours > 0 && day.hours <= MAX_PLAUSIBLE_HOURS).reduce((n, [, day]) => n + (day.hours || 0), 0) }));
}
