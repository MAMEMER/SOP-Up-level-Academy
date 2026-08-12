import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import { verifySession } from "../../../../lib/session-jwt.ts";
import { sopUserForEmail } from "../../../../lib/sop-users.ts";
import { SOP_SESSION_COOKIE } from "../../../../lib/auth-session.ts";
import { hasStoreHubCreds } from "../../../../lib/storehub-api.ts";
import { adminDb, hasAdminCredentials } from "../../../../lib/firebase-admin.ts";
import {
  MAIN_STORE,
  STOREHUB_BASE,
  buildImageIndexes,
  buildMergePayload,
  buildShopRow,
  stockChanged,
  type LorcanaCard,
  type PkmCard,
  type StoreHubProduct,
} from "../../../../lib/storehub-shop-sync.ts";

// Nightly StoreHub → Firestore `shop-products` sync so uplevelguild.com/shop stock stays in
// step with the till. Pulls /products + /inventory/{mainStore}, joins the catalog images,
// maps category→type and applies the VAT (×1.07) price suggestion — logic ported verbatim
// from scripts/storehub-shop-sync-reference.mjs (see lib/storehub-shop-sync.ts). Writes with
// merge:true and a payload that OMITS admin-owned fields (price / priceOverride / listed*),
// so the sync never clobbers a hand-set price or the "confirm it goes live" curation flag.
//
// Admin-gated, and callable by the Vercel cron with the CRON_SECRET (same gate as
// sync-clockin). Records the outcome to `shop_sync_status/latest` so other screens can tell
// when the shop last synced.

// StoreHub Open API rate limit: 3 calls/second. This route makes only 3 GETs; a 350ms gap
// between them keeps us comfortably under the ceiling.
const RATE_GAP_MS = 350;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function authHeader(): string {
  const user = process.env.STOREHUB_USER || "";
  const pass = process.env.STOREHUB_PASS || "";
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

async function sh<T>(path: string): Promise<T> {
  const res = await fetch(`${STOREHUB_BASE}${path}`, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`StoreHub ${path} → ${res.status}`);
  return (await res.json()) as T;
}

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

type InventoryRow = { productId: string; quantityOnHand?: number };

export async function GET(request: Request) {
  if (!(await isAllowed(request))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!hasStoreHubCreds()) return NextResponse.json({ error: "storehub_not_configured" }, { status: 503 });
  if (!hasAdminCredentials()) return NextResponse.json({ error: "firebase_not_configured" }, { status: 503 });

  const startedAt = Date.now();
  const db = adminDb();

  try {
    // --- pull StoreHub (3 calls, spaced for the 3/sec rate limit) ---
    const products = await sh<StoreHubProduct[]>("/products");
    await sleep(RATE_GAP_MS);
    const inventory = await sh<InventoryRow[]>(`/inventory/${MAIN_STORE}`);
    const qtyById = new Map<string, number>(inventory.map((x) => [x.productId, x.quantityOnHand || 0]));

    // --- read existing shop-products (preserve admin priceOverride, detect stock changes) ---
    const existingSnap = await db.collection("shop-products").get();
    const existingOverride = new Map<string, number | null>();
    const existingQty = new Map<string, number>();
    existingSnap.forEach((d) => {
      const v = d.data() as { priceOverride?: number | null; qty?: number };
      if (v.priceOverride != null) existingOverride.set(d.id, v.priceOverride);
      if (typeof v.qty === "number") existingQty.set(d.id, v.qty);
    });

    // --- catalog image indexes (lorcana-cards + pkm-cards) ---
    const [lorSnap, pkmSnap] = await Promise.all([
      db.collection("lorcana-cards").get(),
      db.collection("pkm-cards").get(),
    ]);
    const idx = buildImageIndexes(
      lorSnap.docs.map((d) => d.data() as LorcanaCard),
      pkmSnap.docs.map((d) => d.data() as PkmCard)
    );

    // --- build in-stock rows ---
    let changed = 0;
    const rows = [];
    for (const p of products) {
      if (p.isParentProduct) continue; // parents have no own stock
      const qty = qtyById.get(p.id) || 0;
      if (qty <= 0) continue; // in-stock only
      const priceOverride = existingOverride.get(p.id) ?? null;
      const row = buildShopRow(p, qty, priceOverride, idx);
      if (stockChanged(existingQty.get(p.id), qty)) changed++;
      rows.push(row);
    }

    // --- batched merge writes (payload omits admin-owned fields) ---
    let written = 0;
    for (let i = 0; i < rows.length; i += 450) {
      const batch = db.batch();
      for (const row of rows.slice(i, i + 450)) {
        batch.set(
          db.collection("shop-products").doc(row.id),
          { ...buildMergePayload(row), updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
      }
      await batch.commit();
      written += Math.min(450, rows.length - i);
    }

    const durationSec = Math.round((Date.now() - startedAt) / 100) / 10;
    const result = { ok: true as const, products: written, changed, durationSec };

    await db
      .collection("shop_sync_status")
      .doc("latest")
      .set(
        {
          ok: true,
          products: written,
          changed,
          durationSec,
          finishedAt: FieldValue.serverTimestamp(),
          source: "sync-shop",
        },
        { merge: true }
      );

    return NextResponse.json(result);
  } catch (error) {
    const durationSec = Math.round((Date.now() - startedAt) / 100) / 10;
    const detail = String(error);
    await db
      .collection("shop_sync_status")
      .doc("latest")
      .set(
        { ok: false, error: detail, durationSec, finishedAt: FieldValue.serverTimestamp(), source: "sync-shop" },
        { merge: true }
      )
      .catch(() => {});
    return NextResponse.json({ error: "sync_failed", detail }, { status: 500 });
  }
}
