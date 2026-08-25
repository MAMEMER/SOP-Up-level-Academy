import "server-only";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import type { ChecklistConfig } from "./daily-checklist.ts";

// Server-side reader for JUST the หัวข้อ deadline windows of the owner-edited checklist
// config (sop_daily_checklist/<branch>). The full config is read by the client store
// through /api/checklist-config; the self-review page runs on the server and only needs
// the times, so it reads the one field directly instead of proxying its own API call.
//
// No credentials (local dev) → {} so callers fall back to the built-in defaults in
// lib/daily-checklist.ts. A deadline shown from defaults is still the deadline staff see
// when the owner has not overridden it.

const COLLECTION = "sop_daily_checklist";

export async function fetchPhaseWindows(branch: string): Promise<ChecklistConfig["windows"]> {
  if (!hasAdminCredentials()) return {};
  try {
    const snap = await adminDb().collection(COLLECTION).doc(branch).get();
    if (!snap.exists) return {};
    return ((snap.data() as Record<string, unknown>).windows as ChecklistConfig["windows"]) ?? {};
  } catch {
    return {};
  }
}
