import "server-only";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import { hasStoreHubCreds, storeHubGet } from "./storehub-api.ts";
import { branchConfig } from "./store-config.ts";
import { computeStockLoss, isSnackOrDrink, type SaleLine, type StockCount, type StockLossResult } from "./stock-loss-calc.ts";

// โหลดข้อมูลให้หน้า /admin/stock-loss
//  - ผลนับ Stock Take: Firestore `sop_stocktakes` (StoreHub ไม่มี API ของ stocktake — สคริปต์
//    scripts/stocktake-sync.mjs ดึงจาก BackOffice มาเก็บไว้ทุกวัน)
//  - ยอดขาย + ราคาป้าย: StoreHub Open API สด

export const STOCKTAKE_COLLECTION = "sop_stocktakes";

/** ดึงรอบนับเผื่อนอกช่วงเท่านี้ ไว้ช่วยจับเลขกรอกผิดที่ขอบช่วง */
const EDGE_MS = 3 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type StocktakeDoc = {
  startAt: number;
  completedAt?: number;
  status: string;
  supplier?: string;
  /** JSON: [sku, name, expected, counted][] */
  items: string;
};

async function loadCounts(from: number, to: number): Promise<{ counts: StockCount[]; syncedAt?: number }> {
  const db = adminDb();
  const snap = await db
    .collection(STOCKTAKE_COLLECTION)
    .where("startAt", ">=", from - EDGE_MS)
    .where("startAt", "<=", to + EDGE_MS)
    .get();
  const counts: StockCount[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() as StocktakeDoc;
    if (data.status !== "Completed") continue;
    let items: [string, string, number, number][] = [];
    try {
      items = JSON.parse(data.items);
    } catch {
      continue;
    }
    for (const [sku, name, expected, counted] of items) {
      if (!sku || !isSnackOrDrink(sku, name)) continue;
      counts.push({ sku, name, at: data.startAt, expected: Number(expected), counted: Number(counted) });
    }
  }
  const meta = await db.collection(STOCKTAKE_COLLECTION).doc("_meta").get();
  return { counts, syncedAt: meta.exists ? Number(meta.get("syncedAt")) || undefined : undefined };
}

type ProductRow = { id?: string; sku?: string; name?: string; unitPrice?: number };
type Transaction = {
  storeId?: string;
  isCancelled?: boolean;
  transactionType?: string;
  transactionTime?: string;
  items?: { productId?: string; quantity?: number; total?: number }[];
};

let productCache: { at: number; byId: Map<string, { sku: string; label: number }> } | null = null;

async function snackDrinkProducts() {
  if (productCache && Date.now() - productCache.at < 60 * 60 * 1000) return productCache.byId;
  const rows = await storeHubGet<ProductRow[]>("/products");
  const byId = new Map<string, { sku: string; label: number }>();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row.id || !row.sku || !isSnackOrDrink(row.sku, row.name || "")) continue;
    byId.set(row.id, { sku: row.sku.trim(), label: Math.round((Number(row.unitPrice) || 0) * 1.07 * 100) / 100 });
  }
  productCache = { at: Date.now(), byId };
  return byId;
}

async function loadSales(from: number, to: number, storeId: string) {
  const products = await snackDrinkProducts();
  const sales: SaleLine[] = [];
  // ทีละ 7 วัน ทีละช่วง — StoreHub จำกัด 3 req/วินาที
  for (let start = from; start < to; start += 7 * DAY_MS) {
    const end = Math.min(to, start + 7 * DAY_MS);
    const list = await storeHubGet<Transaction[]>(
      `/transactions?storeId=${storeId}&from=${encodeURIComponent(new Date(start).toISOString())}&to=${encodeURIComponent(new Date(end).toISOString())}`
    );
    for (const tx of Array.isArray(list) ? list : []) {
      if (tx.isCancelled || (tx.transactionType && tx.transactionType !== "Sale")) continue;
      if (tx.storeId && tx.storeId !== storeId) continue;
      const at = Date.parse(tx.transactionTime || "");
      if (!Number.isFinite(at)) continue;
      for (const line of tx.items || []) {
        const product = line.productId ? products.get(line.productId) : undefined;
        if (!product) continue;
        sales.push({ sku: product.sku, at, qty: Number(line.quantity) || 0, total: Number(line.total) || 0 });
      }
    }
  }
  const labels: Record<string, number> = {};
  for (const { sku, label } of products.values()) labels[sku] = label;
  return { sales, labels };
}

export type StockLossReport = StockLossResult & { from: number; to: number; syncedAt?: number };

export async function getStockLossReport(from: number, to: number, branchKey = "bangkae"): Promise<StockLossReport> {
  if (!hasAdminCredentials()) throw new Error("ยังไม่ได้ตั้ง Firebase admin");
  if (!hasStoreHubCreds()) throw new Error("ยังไม่ได้ตั้ง StoreHub API");
  const storeId = branchConfig(branchKey).storeHubStoreId;
  if (!storeId) throw new Error("สาขานี้ไม่มี StoreHub store id");
  const [{ counts, syncedAt }, { sales, labels }] = await Promise.all([loadCounts(from, to), loadSales(from - EDGE_MS, to + EDGE_MS, storeId)]);
  return { ...computeStockLoss(counts, sales, labels, from, to), from, to, syncedAt };
}
