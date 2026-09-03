// "ของที่ต้องสั่ง" — รายการสินค้าที่คงเหลือถึง/ต่ำกว่าจุดสั่งซื้อ สำหรับแจ้งพนักงานอัตโนมัติใน SOP.
//
// แหล่งข้อมูลหลัก = **StoreHub Open API** (Basic auth, api.storehubhq.com) ซึ่งมีของครบพอดี:
//   GET /stores              → รายชื่อสาขา
//   GET /inventory/{storeId} → [{ productId, quantityOnHand, warningStock, idealStock }]
//   GET /products            → ชื่อ/หมวดของสินค้า (ไม่มี query param ต้องดึงทั้งก้อน)
// warningStock = จุดสั่งซื้อ · idealStock = จำนวนที่อยากให้มี → "ต้องสั่งเพิ่มกี่ชิ้น" = ideal − คงเหลือ.
// (หมายเหตุเดิมในไฟล์นี้เขียนว่า API ไม่มี stock endpoint — ผิด ยืนยันสดแล้ว 2026-09-03 ว่ามี /inventory)
//
// แหล่งสำรอง: ถ้าไม่ได้ตั้ง STOREHUB_USER/PASS แต่ตั้ง `STOREHUB_SUPPLY_NEEDS_URL` (ลิงก์ export
// JSON/CSV ของหน้า backoffice https://uplevel.storehubhq.com/stocks/supplyNeeds) ระบบจะดึงจากลิงก์นั้นแทน.

import { hasStoreHubCreds, storeHubGet } from "./storehub-api.ts";
import { branchConfig } from "./store-config.ts";

export type SupplyNeedItem = {
  name: string;
  remaining: number;
  reorderPoint?: number;
  /** จำนวนที่ควรมีในสต๊อก (StoreHub idealStock) */
  idealStock?: number;
  /** ต้องสั่งเพิ่มกี่ชิ้นถึงจะเต็ม = idealStock − คงเหลือ */
  orderQty?: number;
  /** ต้นทุนต่อชิ้น (บาท) จาก StoreHub */
  unitCost?: number;
  /** มูลค่าที่ต้องสั่งของรายการนี้ = orderQty × unitCost */
  estimatedCost?: number;
  /** ต้นทุนมาจากไหน: cost = ช่องต้นทุน · price = เดาจากราคาขายก่อน VAT · none = ไม่มีข้อมูล */
  costSource?: "cost" | "price" | "none";
  category?: string;
  unit?: string;
  /** StoreHub productId — ใช้จับคู่กับยอดขาย */
  productId?: string;
  /** ขายไปกี่ชิ้นใน 30 วันล่าสุด */
  sold30d?: number;
  /** คงเหลือ ÷ จุดสั่งซื้อ — ≤1 คือถึงจุดต้องสั่งแล้ว */
  stockRatio?: number;
  /** เหตุผลที่แนะนำให้สั่งตัวนี้ (เฉพาะรายการที่ระบบเสนอเพิ่ม) */
  note?: string;
};

/** แผนการสั่งของหนึ่งรอบ: ของที่ต้องสั่งจริง + ของที่เสนอให้หยิบเพิ่มเพื่อให้ถึงยอดขั้นต่ำ */
export type SupplyOrderPlan = {
  /** ถึงจุดสั่งซื้อแล้ว ยังไงก็ต้องสั่ง */
  must: SupplyNeedItem[];
  /** ข้อเสนอ: หยิบเพิ่มเพื่อให้บิลถึงยอดขั้นต่ำ เรียงจากของขายดี */
  suggested: SupplyNeedItem[];
  mustTotal: number;
  suggestedTotal: number;
  grandTotal: number;
  minOrderValue: number;
  /** ยังขาดอีกกี่บาทถึงยอดขั้นต่ำ หลังรวมข้อเสนอแล้ว (0 = ถึงแล้ว) */
  shortOfMinimum: number;
  reachedMinimum: boolean;
};

type Row = Record<string, unknown>;

const NAME_KEYS = ["productName", "name", "title", "product_name", "product", "item", "itemName", "สินค้า", "ชื่อสินค้า"];
const REMAINING_KEYS = [
  "stockOnHand",
  "quantityOnHand",
  "quantity",
  "availableQuantity",
  "inventoryQty",
  "onHand",
  "remaining",
  "qty",
  "stock",
  "คงเหลือ",
  "จำนวนที่เหลือ",
  "จำนวนคงเหลือ"
];
const REORDER_KEYS = [
  "reorderPoint",
  "reorderLevel",
  "warningStock",
  "lowStockAlert",
  "minStock",
  "minimumStock",
  "safetyStock",
  "จุดสั่งซื้อ",
  "ขั้นต่ำ"
];
const UNIT_KEYS = ["unit", "uom", "หน่วย"];

const DEFAULT_THRESHOLD = 5;

export function hasSupplyNeedsFeed(): boolean {
  return Boolean(process.env.STOREHUB_SUPPLY_NEEDS_URL);
}

/** มีทางดึง "ของที่ต้องสั่ง" ได้ไหม — API ก่อน ถ้าไม่มี creds ค่อยดูลิงก์ export สำรอง */
export function hasSupplyNeedsSource(): boolean {
  return hasStoreHubCreds() || hasSupplyNeedsFeed();
}

function stringField(row: Row, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return fallback;
}

function numberField(row: Row, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const cleaned = value.replace(/,/g, "").trim();
      if (cleaned && Number.isFinite(Number(cleaned))) return Number(cleaned);
    }
  }
  return undefined;
}

function rowsFromPayload(payload: unknown): Row[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Row => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  }
  if (!payload || typeof payload !== "object") return [];
  const object = payload as Record<string, unknown>;
  for (const candidate of [object.supplyNeeds, object.products, object.items, object.data, object.inventory, object.rows]) {
    if (Array.isArray(candidate)) return rowsFromPayload(candidate);
  }
  return [];
}

/** แยกบรรทัด CSV เดียว (รองรับ field ที่ครอบด้วย " และ escaped ""). */
function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function rowsFromCsv(text: string): Row[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row: Row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] !== undefined ? cells[index].trim() : "";
    });
    return row;
  });
}

/** แปลง payload (array/object JSON หรือข้อความ CSV) เป็นรายการสินค้า พร้อมจำนวนคงเหลือ. */
export function parseSupplyNeeds(payload: unknown): SupplyNeedItem[] {
  let rows: Row[];
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        rows = rowsFromPayload(JSON.parse(trimmed));
      } catch {
        rows = rowsFromCsv(trimmed);
      }
    } else {
      rows = rowsFromCsv(trimmed);
    }
  } else {
    rows = rowsFromPayload(payload);
  }

  const items: SupplyNeedItem[] = [];
  for (const row of rows) {
    const name = stringField(row, NAME_KEYS);
    if (!name) continue;
    const remaining = numberField(row, REMAINING_KEYS);
    if (remaining === undefined) continue;
    const reorderPoint = numberField(row, REORDER_KEYS);
    const unit = stringField(row, UNIT_KEYS) || undefined;
    items.push({ name, remaining, ...(reorderPoint !== undefined ? { reorderPoint } : {}), ...(unit ? { unit } : {}) });
  }
  return items;
}

/**
 * กรองเฉพาะรายการที่ใกล้หมด: คงเหลือ <= จุดสั่งซื้อ (ถ้ามี) ไม่งั้นใช้ threshold ค่าเริ่มต้น.
 * เรียงจากน้อยไปมาก เพื่อให้ของที่ใกล้หมดสุดอยู่บนสุด.
 */
export function filterNearEmpty(items: SupplyNeedItem[], threshold = DEFAULT_THRESHOLD): SupplyNeedItem[] {
  return items
    .filter((item) => item.remaining <= (item.reorderPoint ?? threshold))
    .sort((a, b) => a.remaining - b.remaining);
}

/** สรุปเป็นข้อความ "ชื่อสินค้า | จำนวนที่เหลือ" ต่อบรรทัด (เติมลง textarea ได้เลย). */
export function summariseSupplyNeeds(items: SupplyNeedItem[]): string {
  return items.map((item) => `${item.name} | ${item.remaining}${item.unit ? ` ${item.unit}` : ""}`).join("\n");
}

export type SupplyNeedsResult = {
  fetchedAt: string;
  items: SupplyNeedItem[];
  /** มาจากไหน — "api" = StoreHub Open API, "feed" = ลิงก์ export สำรอง */
  source?: "api" | "feed";
  /** รายการที่ยังไม่ถึงจุดสั่งซื้อแต่เหลือน้อย (เตือนล่วงหน้า ไม่ต้องสั่งวันนี้) */
  watch?: SupplyNeedItem[];
  /** ตั้งจุดสั่งซื้อไว้กี่รายการ — ถ้าน้อยผิดปกติแปลว่ายังไม่ได้ตั้งค่าใน StoreHub */
  trackedCount?: number;
  /** มูลค่ารวมโดยประมาณของของที่ต้องสั่ง (บาท) */
  estimatedTotal?: number;
  /** ยอดขั้นต่ำต่อรอบของสาขา (Makro 100 บาท) */
  minOrderValue?: number;
  /** ต้องสั่งเพิ่มอีกกี่บาทถึงจะถึงยอดขั้นต่ำ (0 = ถึงแล้ว) */
  shortOfMinimum?: number;
  /** มีของกี่รายการที่ยังไม่ได้ใส่ต้นทุนใน StoreHub → ยอดรวมต่ำกว่าจริง */
  missingCostCount?: number;
  /** แผนการสั่งรอบนี้ (ของที่ต้องสั่ง + ของที่เสนอให้หยิบเพิ่ม) — มีเฉพาะเมื่อดึงผ่าน API */
  plan?: SupplyOrderPlan;
};

export type StoreHubInventoryRow = {
  productId?: string;
  quantityOnHand?: number;
  warningStock?: number;
  idealStock?: number;
};

export type StoreHubProductRow = {
  id?: string;
  name?: string;
  category?: string;
  subCategory?: string;
  /** ต้นทุนต่อชิ้นที่ตั้งไว้ใน StoreHub */
  cost?: number;
  /** ราคาขายก่อน VAT (ราคาหน้าร้าน = unitPrice × 1.07) */
  unitPrice?: number;
};

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * ต้นทุนต่อชิ้นที่ใช้ประเมินมูลค่า: ใช้ช่อง "ต้นทุน" ก่อน ถ้าไม่ได้กรอกไว้ (0/ว่าง)
 * ค่อยเดาจากราคาขายก่อน VAT — ระบุที่มาไว้เสมอ เพื่อให้รู้ว่าตัวไหนเป็นตัวเลขเดา.
 */
function unitCostOf(product: StoreHubProductRow | undefined): { cost: number; source: "cost" | "price" | "none" } {
  const cost = toNumber(product?.cost);
  if (cost > 0) return { cost, source: "cost" };
  const price = toNumber(product?.unitPrice);
  if (price > 0) return { cost: price, source: "price" };
  return { cost: 0, source: "none" };
}

/**
 * รวม inventory + products ของ StoreHub เป็นรายการ "ของที่ต้องสั่ง".
 * นับเฉพาะสินค้าที่ **ตั้งจุดสั่งซื้อไว้** (warningStock > 0) เพราะสต๊อกส่วนใหญ่เป็นการ์ดใบเดี่ยว
 * ที่ไม่ได้สั่งซื้อซ้ำ — ถ้าไม่กรอง รายการจะกลายเป็นการ์ด 5 พันใบและไม่มีใครอ่าน.
 * เรียงจาก "ขาดหนักสุด" ก่อน: สัดส่วนคงเหลือ/จุดสั่งซื้อ น้อยสุดขึ้นก่อน แล้วค่อยดูจำนวนที่ต้องสั่ง.
 */
export function buildSupplyNeeds(
  inventory: StoreHubInventoryRow[],
  products: StoreHubProductRow[]
): {
  needs: SupplyNeedItem[];
  watch: SupplyNeedItem[];
  /** ทุกรายการที่ตั้งจุดสั่งซื้อไว้ เรียงจากขาดหนักสุด — ใช้ต่อในการเสนอของเพิ่ม */
  tracked: SupplyNeedItem[];
  trackedCount: number;
  estimatedTotal: number;
  missingCostCount: number;
} {
  const nameById = new Map<string, StoreHubProductRow>();
  for (const product of products) {
    if (product?.id) nameById.set(product.id, product);
  }

  const tracked: Array<{ item: SupplyNeedItem; ratio: number }> = [];
  for (const row of inventory) {
    const productId = row?.productId;
    const reorderPoint = toNumber(row?.warningStock);
    if (!productId || reorderPoint <= 0) continue;
    const product = nameById.get(productId);
    const name = (product?.name || "").trim();
    if (!name) continue;
    const remaining = toNumber(row?.quantityOnHand);
    const idealStock = toNumber(row?.idealStock);
    const orderQty = idealStock > 0 ? Math.max(idealStock - remaining, 0) : 0;
    const { cost, source } = unitCostOf(product);
    const item: SupplyNeedItem = {
      name,
      productId,
      remaining,
      reorderPoint,
      stockRatio: remaining / reorderPoint,
      ...(idealStock > 0 ? { idealStock, orderQty } : {}),
      ...(cost > 0 ? { unitCost: round2(cost), estimatedCost: round2(orderQty * cost) } : {}),
      costSource: source,
      ...(product?.category ? { category: product.category } : {})
    };
    tracked.push({ item, ratio: item.stockRatio ?? 0 });
  }

  tracked.sort((a, b) => a.ratio - b.ratio || (b.item.orderQty ?? 0) - (a.item.orderQty ?? 0));

  const needs = tracked.filter((entry) => entry.ratio <= 1).map((entry) => entry.item);
  // เตือนล่วงหน้า: ยังไม่ถึงจุดสั่งซื้อแต่เหลือไม่ถึง 1.5 เท่าของจุดสั่งซื้อ
  const watch = tracked.filter((entry) => entry.ratio > 1 && entry.ratio <= 1.5).map((entry) => entry.item);
  const estimatedTotal = round2(needs.reduce((sum, item) => sum + (item.estimatedCost ?? 0), 0));
  // ของที่ต้องสั่งแต่ไม่มีต้นทุนในระบบ → ยอดรวมต่ำกว่าจริง ต้องบอกให้รู้ ไม่ใช่เงียบ
  const missingCostCount = needs.filter((item) => (item.orderQty ?? 0) > 0 && !item.unitCost).length;
  return {
    needs,
    watch,
    tracked: tracked.map((entry) => entry.item),
    trackedCount: tracked.length,
    estimatedTotal,
    missingCostCount
  };
}

/** ใส่ยอดขาย 30 วันเข้าไปในรายการ (จับคู่ด้วย productId) */
export function withSales(items: SupplyNeedItem[], sold: Record<string, number>): SupplyNeedItem[] {
  return items.map((item) => ({ ...item, sold30d: item.productId ? sold[item.productId] ?? 0 : 0 }));
}

/**
 * วางแผนการสั่งของหนึ่งรอบ.
 *
 * ของที่ถึงจุดสั่งซื้อแล้ว = ต้องสั่งอยู่แล้ว. ถ้ารวมกันยังไม่ถึงยอดขั้นต่ำของซัพพลายเออร์
 * (Makro ต้อง 1,000 บาท) ระบบจะ **เสนอ** ของที่ควรหยิบเพิ่ม โดยเลือกจาก:
 *   1. ของที่ยังไม่ถึงจุดสั่งซื้อแต่ต่ำกว่าจำนวนที่ควรมี — เติมให้เต็มก่อน ไม่ใช่ซื้อของไม่จำเป็น
 *   2. ของขายดี (ยอดขาย 30 วัน) — ยังไงก็ขายออก ไม่จม
 * แล้วตัดจำนวนของรายการสุดท้ายให้พอดีถึงยอดขั้นต่ำ ไม่สั่งเกินโดยไม่จำเป็น.
 */
export function buildOrderPlan(tracked: SupplyNeedItem[], minOrderValue: number): SupplyOrderPlan {
  const must = tracked.filter((item) => (item.stockRatio ?? 0) <= 1);
  const mustTotal = round2(must.reduce((sum, item) => sum + (item.estimatedCost ?? 0), 0));

  const suggested: SupplyNeedItem[] = [];
  let running = mustTotal;

  if (minOrderValue > 0 && running < minOrderValue) {
    const pool = tracked
      .filter((item) => (item.stockRatio ?? 0) > 1 && (item.unitCost ?? 0) > 0)
      .map((item) => {
        const gap = Math.max((item.idealStock ?? 0) - item.remaining, 0);
        // เพดานต่อรายการ = เติมให้เต็ม หรือหนึ่งเดือนของยอดขาย แล้วแต่อะไรมากกว่า —
        // ของที่ขายหมดใน 1 เดือนไม่ถือว่าจม แต่มากกว่านั้นคือเอาเงินไปแช่ไว้ในสต๊อก
        const monthly = Math.ceil(item.sold30d ?? 0);
        return { item, maxQty: Math.max(gap, monthly, 1), belowIdeal: gap > 0 };
      })
      .filter((entry) => entry.maxQty > 0)
      // เติมของที่ยังไม่เต็มก่อน แล้วค่อยไล่ตามของขายดี
      .sort(
        (a, b) =>
          Number(b.belowIdeal) - Number(a.belowIdeal) || (b.item.sold30d ?? 0) - (a.item.sold30d ?? 0)
      );

    for (const entry of pool) {
      if (running >= minOrderValue) break;
      const unitCost = entry.item.unitCost ?? 0;
      const needed = Math.ceil((minOrderValue - running) / unitCost);
      const qty = Math.min(entry.maxQty, Math.max(needed, 1));
      const cost = round2(qty * unitCost);
      suggested.push({
        ...entry.item,
        orderQty: qty,
        estimatedCost: cost,
        note: entry.belowIdeal
          ? `เหลือ ${entry.item.remaining} จากที่ควรมี ${entry.item.idealStock} · ขาย ${entry.item.sold30d ?? 0} ชิ้น/30 วัน`
          : `ขายดี ${entry.item.sold30d ?? 0} ชิ้น/30 วัน — เติมให้บิลถึงยอดขั้นต่ำ`
      });
      running = round2(running + cost);
    }

    // ถ้าเติมทุกตัวจนเต็มเพดานแล้วยังไม่ถึงขั้นต่ำ ก็ปล่อยให้ยอดขาดไว้แล้วรายงานตามจริง —
    // ไม่ยัดของขายดีเพิ่มแบบไม่มีเพดาน เพราะนั่นคือเอาเงินไปจมกับของที่ขายไม่ทัน
  }

  const suggestedTotal = round2(suggested.reduce((sum, item) => sum + (item.estimatedCost ?? 0), 0));
  const grandTotal = round2(mustTotal + suggestedTotal);
  return {
    must,
    suggested,
    mustTotal,
    suggestedTotal,
    grandTotal,
    minOrderValue,
    shortOfMinimum: round2(Math.max(minOrderValue - grandTotal, 0)),
    reachedMinimum: minOrderValue <= 0 || grandTotal >= minOrderValue
  };
}

// แคชในหน่วยความจำของ instance — StoreHub จำกัด 3 calls/sec และ /products คือก้อน ~3MB
// ที่ไม่มี query param ให้กรอง จึงไม่ควรดึงใหม่ทุกครั้งที่พนักงานเปิดหน้า.
const PRODUCTS_TTL_MS = 15 * 60 * 1000;
const INVENTORY_TTL_MS = 3 * 60 * 1000;
let productsCache: { at: number; rows: StoreHubProductRow[] } | null = null;
let inventoryCache: { at: number; storeId: string; rows: StoreHubInventoryRow[] } | null = null;

async function cachedProducts(): Promise<StoreHubProductRow[]> {
  const now = Date.now();
  if (productsCache && now - productsCache.at < PRODUCTS_TTL_MS) return productsCache.rows;
  const raw = await storeHubGet<StoreHubProductRow[]>("/products");
  // เก็บเฉพาะฟิลด์ที่ใช้ ไม่งั้นก้อน 3MB ค้างอยู่ในหน่วยความจำทั้งก้อน
  const rows = (Array.isArray(raw) ? raw : []).map((product) => ({
    id: product?.id,
    name: product?.name,
    category: product?.category,
    cost: product?.cost,
    unitPrice: product?.unitPrice
  }));
  productsCache = { at: now, rows };
  return rows;
}

async function cachedInventory(storeId: string): Promise<StoreHubInventoryRow[]> {
  const now = Date.now();
  if (inventoryCache && inventoryCache.storeId === storeId && now - inventoryCache.at < INVENTORY_TTL_MS) {
    return inventoryCache.rows;
  }
  const raw = await storeHubGet<StoreHubInventoryRow[]>(`/inventory/${storeId}`);
  const rows = Array.isArray(raw) ? raw : [];
  inventoryCache = { at: now, storeId, rows };
  return rows;
}

export type StoreHubTransaction = {
  storeId?: string;
  isCancelled?: boolean;
  items?: Array<{ productId?: string; quantity?: number }>;
};

/** รวมจำนวนที่ขายไปต่อสินค้า จากรายการขาย (ข้ามบิลที่ยกเลิก) */
export function tallySoldQuantities(transactions: StoreHubTransaction[]): Record<string, number> {
  const sold: Record<string, number> = {};
  for (const transaction of transactions) {
    if (transaction?.isCancelled) continue;
    for (const line of transaction?.items ?? []) {
      const productId = line?.productId;
      const quantity = toNumber(line?.quantity);
      if (!productId || quantity <= 0) continue;
      sold[productId] = (sold[productId] ?? 0) + quantity;
    }
  }
  return sold;
}

const SALES_TTL_MS = 60 * 60 * 1000;
const SALES_WINDOW_DAYS = 30;
let salesCache: { at: number; storeId: string; sold: Record<string, number> } | null = null;

async function cachedSales(storeId: string): Promise<Record<string, number>> {
  const now = Date.now();
  if (salesCache && salesCache.storeId === storeId && now - salesCache.at < SALES_TTL_MS) return salesCache.sold;
  const to = new Date(now).toISOString();
  const from = new Date(now - SALES_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const raw = await storeHubGet<StoreHubTransaction[]>(
    `/transactions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  );
  const sold = tallySoldQuantities((Array.isArray(raw) ? raw : []).filter((t) => !t.storeId || t.storeId === storeId));
  salesCache = { at: now, storeId, sold };
  return sold;
}

/** ดึง "ของที่ต้องสั่ง" สดจาก StoreHub Open API. โยน error ถ้าไม่ได้ตั้ง creds หรือดึงไม่ได้. */
export async function fetchSupplyNeedsFromApi(branchKey = "bangkae"): Promise<SupplyNeedsResult> {
  if (!hasStoreHubCreds()) throw new Error("STOREHUB_USER/STOREHUB_PASS is not configured");
  const storeId = branchConfig(branchKey).storeHubStoreId;
  if (!storeId) throw new Error(`branch ${branchKey} has no storeHubStoreId`);

  const [inventory, products, sold] = await Promise.all([
    cachedInventory(storeId),
    cachedProducts(),
    // ยอดขายใช้แค่จัดอันดับของที่จะเสนอเพิ่ม — ถ้าดึงไม่ได้ก็ยังบอกของที่ต้องสั่งได้
    cachedSales(storeId).catch(() => ({}) as Record<string, number>)
  ]);
  const { watch, tracked, trackedCount, estimatedTotal, missingCostCount } = buildSupplyNeeds(inventory, products);
  const minOrderValue = branchConfig(branchKey).supplyMinOrderValue ?? 0;
  const plan = buildOrderPlan(withSales(tracked, sold), minOrderValue);
  return {
    fetchedAt: new Date().toISOString(),
    items: plan.must,
    watch: withSales(watch, sold),
    plan,
    trackedCount,
    estimatedTotal,
    missingCostCount,
    minOrderValue,
    shortOfMinimum: plan.shortOfMinimum,
    source: "api"
  };
}

/**
 * ดึงรายการของที่ต้องสั่ง — ใช้ StoreHub Open API ก่อน (สดเสมอ ไม่ต้องดูแล cookie)
 * ถ้าไม่มี creds ค่อยถอยไปใช้ลิงก์ export สำรอง.
 */
export async function fetchSupplyNeeds(threshold = DEFAULT_THRESHOLD): Promise<SupplyNeedsResult> {
  if (hasStoreHubCreds()) return fetchSupplyNeedsFromApi();
  return fetchSupplyNeedsFromFeed(threshold);
}

/** ดึง Supply Needs จาก feed URL แล้วคืนเฉพาะรายการใกล้หมด. โยน error ถ้าไม่ได้ตั้งค่า/ดึงไม่ได้. */
export async function fetchSupplyNeedsFromFeed(threshold = DEFAULT_THRESHOLD): Promise<SupplyNeedsResult> {
  const url = process.env.STOREHUB_SUPPLY_NEEDS_URL;
  if (!url) throw new Error("STOREHUB_SUPPLY_NEEDS_URL is not configured");

  const token = process.env.STOREHUB_SUPPLY_NEEDS_TOKEN;
  // Cookie header ทางเลือก: ให้ชี้ feed URL ตรงไปที่ backoffice XHR endpoint ของ StoreHub
  // (เช่นที่หน้า supplyNeeds เรียกใช้) แล้ววาง session cookie ที่ copy จาก browser ได้เลย —
  // ไม่ต้องทำ export กลาง. (cookie หมดอายุตาม session ของ StoreHub จึงต้องอัปเดตเป็นครั้งคราว.)
  const cookie = process.env.STOREHUB_SUPPLY_NEEDS_COOKIE;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json, text/csv, */*",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { Cookie: cookie } : {})
    },
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`StoreHub supply-needs feed → ${res.status}`);

  const contentType = res.headers.get("content-type") || "";
  const body = await res.text();
  const payload: unknown = contentType.includes("json") ? safeJson(body) : body;
  const items = filterNearEmpty(parseSupplyNeeds(payload), threshold);
  return { fetchedAt: new Date().toISOString(), items, source: "feed" };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
