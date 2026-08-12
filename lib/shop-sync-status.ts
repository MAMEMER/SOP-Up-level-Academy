import "server-only";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";

// Reads `shop_sync_status/latest` (written by /api/storehub/sync-shop) so the admin hub can
// show when the online-shop stock last synced with StoreHub. Fully defensive: returns null
// on any error or when admin credentials are absent (local dev), so it never breaks the page.

export type ShopSyncStatus = {
  ok: boolean;
  products?: number;
  changed?: number;
  durationSec?: number;
  error?: string;
  /** epoch millis, or null if not recorded yet */
  finishedAtMs: number | null;
};

export async function getShopSyncStatus(): Promise<ShopSyncStatus | null> {
  if (!hasAdminCredentials()) return null;
  try {
    const snap = await adminDb().collection("shop_sync_status").doc("latest").get();
    if (!snap.exists) return null;
    const v = snap.data() as {
      ok?: boolean;
      products?: number;
      changed?: number;
      durationSec?: number;
      error?: string;
      finishedAt?: { toMillis?: () => number };
    };
    const finishedAtMs = typeof v.finishedAt?.toMillis === "function" ? v.finishedAt.toMillis() : null;
    return {
      ok: Boolean(v.ok),
      products: v.products,
      changed: v.changed,
      durationSec: v.durationSec,
      error: v.error,
      finishedAtMs,
    };
  } catch {
    return null;
  }
}
