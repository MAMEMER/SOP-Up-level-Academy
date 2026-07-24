// Live StoreHub Open API client (server-only). Basic auth with STOREHUB_USER/PASS.
// Provides the pieces SOP needs that the API actually exposes: employees (id→name) and
// timesheets (clock-in/out). NOTE: StoreHub has NO stock-take endpoint — stocktakes
// still come from CSV. Base https://api.storehubhq.com.

const BASE = "https://api.storehubhq.com";

function authHeader(): string {
  const user = process.env.STOREHUB_USER || "";
  const pass = process.env.STOREHUB_PASS || "";
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

export function hasStoreHubCreds(): boolean {
  return Boolean(process.env.STOREHUB_USER && process.env.STOREHUB_PASS);
}

async function shFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`StoreHub ${path} → ${res.status}`);
  return (await res.json()) as T;
}

type StoreHubEmployee = { id?: string; _id?: string; firstName?: string; lastName?: string; name?: string };
type StoreHubTimesheet = { employeeId: string; storeId?: string; clockInTime?: string; clockOutTime?: string };

/** Map of StoreHub employeeId → display name ("firstName lastName"). */
export async function fetchEmployeeNames(): Promise<Record<string, string>> {
  const list = await shFetch<StoreHubEmployee[]>("/employees");
  const map: Record<string, string> = {};
  for (const e of list) {
    const id = e.id || e._id;
    if (!id) continue;
    map[id] = (e.name || `${e.firstName || ""} ${e.lastName || ""}`).trim();
  }
  return map;
}

/** Timesheets clocked between from/to (ISO date strings, Bangkok range). */
export async function fetchTimesheets(fromIso: string, toIso: string): Promise<StoreHubTimesheet[]> {
  const list = await shFetch<StoreHubTimesheet[]>(`/timesheets?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`);
  return Array.isArray(list) ? list : [];
}

/** Converts a UTC ISO clock time to Bangkok { workDate: YYYY-MM-DD, time: HH:MM }. */
export function toBangkok(iso: string): { workDate: string; time: string } {
  const d = new Date(iso);
  const bkk = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  const workDate = bkk.toISOString().slice(0, 10);
  const time = bkk.toISOString().slice(11, 16);
  return { workDate, time };
}
