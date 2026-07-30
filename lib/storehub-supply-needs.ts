// StoreHub "Supply Needs" feed → รายการสินค้าใกล้หมด สำหรับแจ้งเตือนพนักงานอัตโนมัติใน SOP.
//
// StoreHub Open API (Basic auth, api.storehubhq.com) ไม่มี endpoint สำหรับ stock/supply-needs
// (ยืนยันจากงานเดิม) ข้อมูล Supply Needs อยู่ในหน้า backoffice
// https://uplevel.storehubhq.com/stocks/supplyNeeds เท่านั้น ซึ่ง export เป็นลิงก์ JSON/CSV ได้.
//
// วิธีใช้: ตั้งค่า env `STOREHUB_SUPPLY_NEEDS_URL` ให้ชี้ไปที่ลิงก์ export (JSON หรือ CSV) ของ
// Supply Needs (เช่น StoreHub scheduled export หรือ Google Sheet ที่ publish เป็น CSV).
// ระบบจะดึง → กรองเฉพาะรายการที่ใกล้หมด → ส่งให้ SOP แสดงเป็นแจ้งเตือน โดยไม่ต้อง copy CSV เอง.

export type SupplyNeedItem = {
  name: string;
  remaining: number;
  reorderPoint?: number;
  unit?: string;
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
};

/** ดึง Supply Needs จาก feed URL แล้วคืนเฉพาะรายการใกล้หมด. โยน error ถ้าไม่ได้ตั้งค่า/ดึงไม่ได้. */
export async function fetchSupplyNeeds(threshold = DEFAULT_THRESHOLD): Promise<SupplyNeedsResult> {
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
  return { fetchedAt: new Date().toISOString(), items };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
