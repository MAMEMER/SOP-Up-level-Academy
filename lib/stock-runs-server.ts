import "server-only";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import type { StockRun, StockRunKind } from "./stock-runs.ts";

// Server-side reader for the Stock Run store, used by the admin pages (Server Components).
// lib/stock-runs-store.ts is a "use client" module (fetches the API route), so a Server
// Component cannot call it. Stock Run documents contain nested arrays/maps (counts,
// approvals, checklist snapshot) that the public-key REST decoder in firestore-rest.ts
// cannot represent, so we read through the Admin SDK directly — which also bypasses the
// shared guild firestore.rules. Dev preview (no service account) returns [] so the page
// still renders.

const RUNS = "stock_runs";

export async function fetchStockRunsForBranch(branch: string, kind?: StockRunKind): Promise<StockRun[]> {
  if (!hasAdminCredentials()) return [];
  try {
    let query = adminDb().collection(RUNS).where("branch", "==", branch);
    if (kind) query = query.where("kind", "==", kind);
    const snap = await query.get();
    return snap.docs.map((doc) => doc.data() as StockRun);
  } catch {
    return [];
  }
}

export async function fetchStockRunById(id: string): Promise<StockRun | null> {
  if (!hasAdminCredentials()) return null;
  try {
    const snap = await adminDb().collection(RUNS).doc(id).get();
    return snap.exists ? (snap.data() as StockRun) : null;
  } catch {
    return null;
  }
}
