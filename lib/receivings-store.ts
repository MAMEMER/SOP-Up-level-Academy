import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import { hasStoreHubCreds, storeHubGet } from "./storehub-api.ts";
import { branchConfigs } from "./store-config.ts";
import { SNAPSHOT_COLLECTION, compactInventory, snapshotId, type InventorySnapshotDoc } from "./inventory-snapshots.ts";
import {
  PRODUCT_COSTS_COLLECTION,
  RECEIVINGS_COLLECTION,
  STATUS_CONFIRMED,
  cancelReceiving,
  confirmReceiving,
  costLines,
  type ProductCost,
  type ProductOption,
  type Receiving
} from "./receivings.ts";

// Storage for รับของเข้า. Same backend switch as masterplan-store.ts:
//   Firestore (service account) → prod
//   .data/receivings.json       → local dev only (no service-account env locally)
//   unavailable                 → on Vercel without credentials

const LOCAL_STORE = join(process.cwd(), ".data", "receivings.json");
const runningOnVercel = Boolean(process.env.VERCEL);

export function receivingsMode(): "firestore" | "local-file" | "unavailable" {
  if (hasAdminCredentials()) return "firestore";
  return runningOnVercel ? "unavailable" : "local-file";
}

type LocalStore = { receivings?: Record<string, Receiving>; costs?: Record<string, ProductCost> };

async function readLocal(): Promise<LocalStore> {
  try {
    return JSON.parse(await readFile(LOCAL_STORE, "utf8")) as LocalStore;
  } catch {
    return {};
  }
}

async function writeLocal(store: LocalStore): Promise<void> {
  await mkdir(dirname(LOCAL_STORE), { recursive: true });
  await writeFile(`${LOCAL_STORE}.tmp`, JSON.stringify(store, null, 2), "utf8");
  await rename(`${LOCAL_STORE}.tmp`, LOCAL_STORE);
}

let localQueue: Promise<unknown> = Promise.resolve();
function withLocalLock<T>(work: () => Promise<T>): Promise<T> {
  const run = localQueue.then(work, work);
  localQueue = run.catch(() => undefined);
  return run;
}

/** Firestore rejects `undefined`. */
const clean = <T,>(data: T): T => JSON.parse(JSON.stringify(data)) as T;

function assertAvailable() {
  if (receivingsMode() === "unavailable") throw new Error("ระบบเก็บข้อมูลยังไม่ได้ตั้งค่า");
}

export async function listReceivings(limit = 200): Promise<Receiving[]> {
  if (receivingsMode() === "firestore") {
    const snap = await adminDb().collection(RECEIVINGS_COLLECTION).orderBy("createdAt", "desc").limit(limit).get();
    return snap.docs.map((d) => d.data() as Receiving);
  }
  if (receivingsMode() === "unavailable") return [];
  const store = await readLocal();
  return Object.values(store.receivings ?? {})
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

export async function getReceiving(id: string): Promise<Receiving | null> {
  if (!id || id.includes("/")) return null;
  if (receivingsMode() === "firestore") {
    const snap = await adminDb().collection(RECEIVINGS_COLLECTION).doc(id).get();
    return snap.exists ? (snap.data() as Receiving) : null;
  }
  return (await readLocal()).receivings?.[id] ?? null;
}

export async function putReceiving(receiving: Receiving): Promise<void> {
  assertAvailable();
  if (receivingsMode() === "firestore") {
    await adminDb().collection(RECEIVINGS_COLLECTION).doc(receiving.id).set(clean(receiving));
    return;
  }
  await withLocalLock(async () => {
    const store = await readLocal();
    store.receivings = { ...(store.receivings ?? {}), [receiving.id]: clean(receiving) };
    await writeLocal(store);
  });
}

// ---------- on-hand basis (latest nightly snapshot BEFORE the receipt date) ----------

const SNAPSHOT_LOOKBACK_DAYS = 7;

function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

async function snapshotItemsBefore(branch: string, date: string): Promise<Record<string, number> | null> {
  const db = adminDb();
  for (let back = 1; back <= SNAPSHOT_LOOKBACK_DAYS; back++) {
    const day = shiftDate(date, -back);
    const first = await db.collection(SNAPSHOT_COLLECTION).doc(snapshotId(branch, day)).get();
    if (!first.exists) continue;
    const head = first.data() as InventorySnapshotDoc;
    const items = { ...head.items };
    for (let part = 2; part <= (head.parts || 1); part++) {
      const more = await db.collection(SNAPSHOT_COLLECTION).doc(snapshotId(branch, day, part)).get();
      if (!more.exists) return null;
      Object.assign(items, (more.data() as InventorySnapshotDoc).items);
    }
    return items;
  }
  return null;
}

/** Shop-wide on-hand per product (sum of branches). Falls back to live StoreHub inventory per branch. */
export async function shopOnHandBefore(productIds: string[], date: string): Promise<Record<string, number>> {
  const out: Record<string, number> = Object.fromEntries(productIds.map((id) => [id, 0]));
  if (receivingsMode() !== "firestore") return out;
  for (const branch of branchConfigs) {
    if (!branch.storeHubStoreId) continue;
    let items = await snapshotItemsBefore(branch.key, date);
    if (!items && hasStoreHubCreds()) {
      items = compactInventory(await storeHubGet<{ productId?: string; quantityOnHand?: number }[]>(`/inventory/${branch.storeHubStoreId}`));
    }
    for (const id of productIds) out[id] += Math.max(items?.[id] ?? 0, 0);
  }
  return out;
}

// ---------- confirm / cancel (cost table writes) ----------

export async function confirmAndApply(id: string, by: string): Promise<{ error?: string; alreadyApplied?: boolean }> {
  assertAvailable();
  const current = await getReceiving(id);
  if (!current) return { error: "ไม่พบรายการ" };
  if (current.appliedAt) return { alreadyApplied: true };
  const productIds = [...new Set(costLines(current).map((l) => l.productId))];
  const onHand = await shopOnHandBefore(productIds, current.date);

  if (receivingsMode() === "firestore") {
    const db = adminDb();
    return db.runTransaction(async (tx) => {
      const ref = db.collection(RECEIVINGS_COLLECTION).doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) return { error: "ไม่พบรายการ" };
      const costRefs = productIds.map((pid) => db.collection(PRODUCT_COSTS_COLLECTION).doc(pid));
      const costSnaps = costRefs.length ? await tx.getAll(...costRefs) : [];
      const costs = Object.fromEntries(costSnaps.map((s) => [s.id, s.exists ? (s.data() as ProductCost) : null]));
      const result = confirmReceiving(snap.data() as Receiving, costs, onHand, by, Date.now());
      if ("error" in result) return { error: result.error };
      if ("alreadyApplied" in result) return { alreadyApplied: true };
      for (const [pid, cost] of Object.entries(result.costs)) tx.set(db.collection(PRODUCT_COSTS_COLLECTION).doc(pid), clean(cost));
      tx.set(ref, clean(result.receiving));
      return {};
    });
  }
  return withLocalLock(async () => {
    const store = await readLocal();
    const receiving = store.receivings?.[id];
    if (!receiving) return { error: "ไม่พบรายการ" };
    const result = confirmReceiving(receiving, store.costs ?? {}, onHand, by, Date.now());
    if ("error" in result) return { error: result.error };
    if ("alreadyApplied" in result) return { alreadyApplied: true };
    store.costs = { ...(store.costs ?? {}), ...clean(result.costs) };
    store.receivings = { ...(store.receivings ?? {}), [id]: clean(result.receiving) };
    await writeLocal(store);
    return {};
  });
}

async function confirmedReceivings(): Promise<Receiving[]> {
  if (receivingsMode() === "firestore") {
    const snap = await adminDb().collection(RECEIVINGS_COLLECTION).where("status", "==", STATUS_CONFIRMED).get();
    return snap.docs.map((d) => d.data() as Receiving);
  }
  return Object.values((await readLocal()).receivings ?? {}).filter((r) => r.status === STATUS_CONFIRMED);
}

export async function cancelAndRecompute(id: string, reason: string, by: string): Promise<{ error?: string }> {
  assertAvailable();
  const target = await getReceiving(id);
  if (!target) return { error: "ไม่พบรายการ" };
  const result = cancelReceiving(target, await confirmedReceivings(), reason, by, Date.now());
  if ("error" in result) return { error: result.error };

  if (receivingsMode() === "firestore") {
    const db = adminDb();
    const batch = db.batch();
    batch.set(db.collection(RECEIVINGS_COLLECTION).doc(id), clean(result.receiving));
    for (const [pid, cost] of Object.entries(result.costs)) {
      const ref = db.collection(PRODUCT_COSTS_COLLECTION).doc(pid);
      if (cost) batch.set(ref, clean(cost));
      else batch.delete(ref);
    }
    await batch.commit();
    return {};
  }
  await withLocalLock(async () => {
    const store = await readLocal();
    store.receivings = { ...(store.receivings ?? {}), [id]: clean(result.receiving) };
    const costs = { ...(store.costs ?? {}) };
    for (const [pid, cost] of Object.entries(result.costs)) {
      if (cost) costs[pid] = clean(cost);
      else delete costs[pid];
    }
    store.costs = costs;
    await writeLocal(store);
  });
  return {};
}

// ---------- StoreHub product catalogue (cached; /products is ~3MB with no filters) ----------

const PRODUCTS_TTL_MS = 10 * 60 * 1000;
let productCache: { at: number; rows: ProductOption[] } | null = null;

// Local dev without StoreHub creds: a tiny dummy catalogue so the picker can be exercised.
const DEV_PRODUCTS: ProductOption[] = [
  { id: "dev-1", name: "ตัวอย่าง Booster Box A", sku: "DEV-BOX-A", barcode: "0000000000011" },
  { id: "dev-2", name: "ตัวอย่าง Booster Box B", sku: "DEV-BOX-B", barcode: "0000000000028" },
  { id: "dev-3", name: "ตัวอย่าง Sleeve สีน้ำเงิน", sku: "DEV-SLV-BLU", barcode: "0000000000035" },
  { id: "dev-4", name: "ตัวอย่าง Deck Box", sku: "DEV-DBX", barcode: "0000000000042" },
  { id: "dev-5", name: "ตัวอย่าง น้ำดื่ม", sku: "DEV-WATER", barcode: "0000000000059" },
  { id: "dev-6", name: "ตัวอย่าง Single Card - Hero", sku: "DEV-SGL-1", barcode: "" }
];

export async function productCatalogue(): Promise<ProductOption[]> {
  if (!hasStoreHubCreds()) return runningOnVercel ? [] : DEV_PRODUCTS;
  const now = Date.now();
  if (productCache && now - productCache.at < PRODUCTS_TTL_MS) return productCache.rows;
  const raw = await storeHubGet<{ id?: string; name?: string; sku?: string | null; barcode?: string | null; isParentProduct?: boolean }[]>("/products");
  const rows = (Array.isArray(raw) ? raw : [])
    .filter((p) => p?.id && !p.isParentProduct)
    .map((p) => ({ id: String(p.id), name: p.name || "", sku: p.sku || "", barcode: p.barcode || "" }));
  productCache = { at: now, rows };
  return rows;
}
