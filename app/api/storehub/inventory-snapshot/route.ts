import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "../../../../lib/session-jwt.ts";
import { sopUserForEmail } from "../../../../lib/sop-users.ts";
import { SOP_SESSION_COOKIE } from "../../../../lib/auth-session.ts";
import { hasStoreHubCreds, storeHubGet } from "../../../../lib/storehub-api.ts";
import { adminDb, hasAdminCredentials } from "../../../../lib/firebase-admin.ts";
import { branchConfigs } from "../../../../lib/store-config.ts";
import {
  SNAPSHOT_COLLECTION,
  bangkokDate,
  buildSnapshotDocs,
  compactInventory,
  estimateBytes,
  snapshotId
} from "../../../../lib/inventory-snapshots.ts";

// Nightly stock snapshot (23:55 Bangkok, vercel.json cron "55 16 * * *" UTC). For every
// branch with a StoreHub store id: GET /inventory/{storeId} → sop_inventory_snapshots/
// {branch}__{YYYY-MM-DD}. Quantities only. Re-running the same day overwrites the same doc(s).
// Same gate as sync-shop: Vercel Cron (CRON_SECRET bearer), ?key=, or an admin session.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// StoreHub Open API rate limit: 3 calls/second.
const RATE_GAP_MS = 350;
const MAX_PARTS = 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function isAllowed(request: Request): Promise<boolean> {
  const url = new URL(request.url);
  const secret = process.env.CRON_SECRET;
  if (secret && url.searchParams.get("key") === secret) return true;
  // Vercel Cron sends this header automatically when CRON_SECRET is set.
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return true;
  const cookie = (await cookies()).get(SOP_SESSION_COOKIE)?.value;
  if (!cookie) return false;
  const session = await verifySession(cookie);
  const user = session ? sopUserForEmail(session.email) : undefined;
  return user?.role === "admin";
}

export async function GET(request: Request) {
  if (!(await isAllowed(request))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!hasStoreHubCreds()) return NextResponse.json({ error: "storehub_not_configured" }, { status: 503 });
  if (!hasAdminCredentials()) return NextResponse.json({ error: "firebase_not_configured" }, { status: 503 });

  const db = adminDb();
  const takenAt = Date.now();
  const date = bangkokDate(takenAt);
  const results: { branch: string; count: number; parts: number; bytes: number }[] = [];

  try {
    let first = true;
    for (const branch of branchConfigs) {
      if (!branch.storeHubStoreId) continue;
      if (!first) await sleep(RATE_GAP_MS);
      first = false;
      const rows = await storeHubGet<{ productId?: string; quantityOnHand?: number }[]>(`/inventory/${branch.storeHubStoreId}`);
      const items = compactInventory(rows);
      const docs = buildSnapshotDocs({ branch: branch.key, storeId: branch.storeHubStoreId, date, takenAt, items });
      const batch = db.batch();
      for (const doc of docs) batch.set(db.collection(SNAPSHOT_COLLECTION).doc(doc.id), doc.data);
      // a re-run that needs fewer parts than an earlier run today must not leave stale parts behind
      for (let part = docs.length + 1; part <= MAX_PARTS; part++) {
        batch.delete(db.collection(SNAPSHOT_COLLECTION).doc(snapshotId(branch.key, date, part)));
      }
      await batch.commit();
      results.push({
        branch: branch.key,
        count: Object.keys(items).length,
        parts: docs.length,
        bytes: Math.max(...docs.map((d) => estimateBytes(d.data)))
      });
    }
    return NextResponse.json({ ok: true, date, branches: results });
  } catch (error) {
    return NextResponse.json({ error: "snapshot_failed", detail: String(error), done: results }, { status: 500 });
  }
}
