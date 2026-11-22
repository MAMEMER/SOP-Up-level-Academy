import "server-only";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import type { PersonTargets } from "./kpi-v2-person-numbers.ts";

export const TEACH_GAMES = ["Pokémon", "Lorcana", "Riftbound", "Monsnatch", "บอร์ดเกม", "อื่นๆ"] as const;
export type TeachLog = { id: string; staffCode: string; branch: string; game: string; customers: number; note: string; createdAt: string };
const logs = () => adminDb().collection("sop_teach_log");
const targets = () => adminDb().collection("sop_kpi_person_targets");
function requireStorage() { if (!hasAdminCredentials()) throw new Error("storage_unavailable"); }
export async function getTeachLogs(period: string): Promise<TeachLog[]> {
  requireStorage();
  const start = new Date(`${period}-01T00:00:00+07:00`);
  const [year, month] = period.split("-").map(Number);
  const end = new Date(Date.UTC(year, month, 1) - 7 * 3600000);
  const result = await logs().where("createdAt", ">=", start.toISOString()).where("createdAt", "<", end.toISOString()).get();
  return result.docs.map((doc) => doc.data() as TeachLog).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function saveTeachLog(record: TeachLog) { requireStorage(); await logs().doc(record.id).create(record); }
export async function deleteOwnTeachLog(id: string, code: string, today: string) {
  requireStorage();
  const ref = logs().doc(id);
  await adminDb().runTransaction(async (transaction) => {
    const doc = await transaction.get(ref);
    const data = doc.data() as TeachLog | undefined;
    if (!data || data.staffCode !== code || new Date(new Date(data.createdAt).getTime() + 7 * 3600000).toISOString().slice(0, 10) !== today) throw new Error("not_allowed");
    transaction.delete(ref);
  });
}
export async function getPersonTargets(period: string): Promise<Record<string, PersonTargets>> {
  requireStorage();
  const snapshot = await targets().where("period", "==", period).get();
  return Object.fromEntries(snapshot.docs.map((doc) => { const data = doc.data(); return [data.staffCode, { teachTarget: data.teachTarget, addonSalesTarget: data.addonSalesTarget, assignedOnTimeTarget: data.assignedOnTimeTarget }]; }));
}
export async function savePersonTarget(period: string, staffCode: string, values: PersonTargets) {
  requireStorage();
  await targets().doc(`${period}__${staffCode}`).set({ period, staffCode, ...values });
}

export async function copyPersonTargetIfMissing(period: string, staffCode: string, values: PersonTargets) {
  requireStorage();
  const ref = targets().doc(`${period}__${staffCode}`);
  await adminDb().runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (!current.exists) transaction.create(ref, { period, staffCode, ...values });
  });
}
