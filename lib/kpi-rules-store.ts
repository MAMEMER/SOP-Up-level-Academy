import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import { KPI_RULES_COLLECTION, KPI_RULES_DOC, mergeKpiRules, type KpiRules, type KpiRulesOverride } from "./kpi-rules.ts";

// Written with the service account: these numbers decide salary deductions, so they must
// not be writable with the public client key. A missing/broken doc falls back to the
// built-in defaults rather than to zero — see mergeKpiRules.

const LOCAL_STORE = join(process.cwd(), ".data", "kpi-rules.json");
const runningOnVercel = Boolean(process.env.VERCEL);

function storageMode(): "firestore" | "local-file" | "unavailable" {
  if (hasAdminCredentials()) return "firestore";
  return runningOnVercel ? "unavailable" : "local-file";
}

async function readLocalOverride(): Promise<KpiRulesOverride | null> {
  try {
    return JSON.parse(await readFile(LOCAL_STORE, "utf8")) as KpiRulesOverride;
  } catch {
    return null;
  }
}

export async function fetchKpiRulesOverride(): Promise<KpiRulesOverride | null> {
  const mode = storageMode();
  if (mode === "firestore") {
    const snap = await adminDb().collection(KPI_RULES_COLLECTION).doc(KPI_RULES_DOC).get();
    return snap.exists ? ((snap.data() as { override?: KpiRulesOverride }).override ?? null) : null;
  }
  if (mode === "local-file") return readLocalOverride();
  return null;
}

/** The rulebook the engine should score with right now. */
export async function fetchKpiRules(): Promise<KpiRules> {
  try {
    return mergeKpiRules(await fetchKpiRulesOverride());
  } catch {
    return mergeKpiRules(null);
  }
}

export async function saveKpiRulesOverride(override: KpiRulesOverride, updatedBy: string): Promise<void> {
  const mode = storageMode();
  if (mode === "unavailable") throw new Error("kpi_rules_storage_unavailable");

  if (mode === "firestore") {
    await adminDb()
      .collection(KPI_RULES_COLLECTION)
      .doc(KPI_RULES_DOC)
      .set({ override, updatedAt: new Date().toISOString(), updatedBy });
    return;
  }
  await mkdir(dirname(LOCAL_STORE), { recursive: true });
  await writeFile(LOCAL_STORE, JSON.stringify(override, null, 2), "utf8");
}

/** Drops every override so the engine scores with the built-in defaults again. */
export async function resetKpiRulesOverride(updatedBy: string): Promise<void> {
  await saveKpiRulesOverride({}, updatedBy);
}
