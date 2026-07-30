// Supply-needs reorder alert — pure parsing + threshold logic (no network, tested).
//
// StoreHub has NO supply-needs / stock-take API (see lib/storehub-api.ts). The
// "ความต้องการเติมสต็อก" list at
//   https://uplevel.storehubhq.com/stocks/supplyNeeds/v2/web
// is exported/copied as CSV by the owner and pasted into the admin page. This module
// turns that paste into a structured reorder list, sums the cost, and — when the total
// reaches the alert threshold (฿1,000 by default, ticket aFa09TOnAQDYzs850k5D) — builds
// the assignment title/detail the owner hands to the on-shift staff via assignWork().
//
// Ticket goal:
//   1. cost ของรายการที่ต้องเติมสต็อก ถึง 1,000 บาท → แจ้งเตือน
//   2. ส่งเป็นงานมอบ (assign work) ให้พนักงานตามกะ ให้สั่งสินค้าตามรายการ
//   3. งานที่มอบหมายมีผลกับ KPI (ผ่าน lifecycle ตรวจงานของ work_assignments เดิม)

/** Default alert threshold in THB. Ticket: "ยอดต้นทุน (cost) ถึง 1,000 บาท". */
export const DEFAULT_REORDER_THRESHOLD_THB = 1000;

export type SupplyNeedRow = {
  productName: string;
  supplier: string;
  /** จำนวนที่แนะนำให้สั่ง (suggested order qty). 0 when the export omits it. */
  orderQuantity: number;
  /** ต้นทุนรวมของรายการนี้ (line cost, THB). */
  lineCost: number;
};

export type ReorderSummary = {
  rows: SupplyNeedRow[];
  totalCost: number;
  itemCount: number;
  threshold: number;
  /** true when totalCost >= threshold — the alert fires. */
  reached: boolean;
};

// ── CSV parsing (RFC-4180-ish, matches storehub-stocktake-export.ts) ──────────

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
    } else if ((char === "," || char === "\t") && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

/**
 * Parse a currency/number cell. Tolerates "฿1,234.50", "1,234", "1234.5", spaces and
 * a trailing "-" (StoreHub renders empty numeric cells as "-"). Returns 0 on junk.
 */
export function parseMoney(value: string): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === "-.") return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Header matching is keyword-based so it survives StoreHub column reordering, renames,
// and Thai/English exports. First matching header wins.
function findColumn(headers: string[], keywords: string[]): number {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (let i = 0; i < lower.length; i += 1) {
    if (keywords.some((k) => lower[i].includes(k))) return i;
  }
  return -1;
}

const PRODUCT_KEYS = ["product", "item", "name", "สินค้า", "ชื่อ", "รายการ"];
const SUPPLIER_KEYS = ["supplier", "vendor", "ผู้ขาย", "ซัพพลาย", "supply"];
const QTY_KEYS = ["order qty", "order quantity", "suggested", "to order", "reorder qty", "จำนวนที่สั่ง", "จำนวนสั่ง", "ต้องสั่ง"];
// Prefer a total/line cost column; fall back to a generic "cost"/"ต้นทุน"/"value".
const COST_TOTAL_KEYS = ["total cost", "total value", "order cost", "line cost", "cost value", "มูลค่า", "ต้นทุนรวม", "ยอดรวม"];
const COST_ANY_KEYS = ["cost", "value", "amount", "ต้นทุน", "ราคา", "cost price"];

/**
 * Parse a pasted StoreHub supply-needs export (CSV or TSV, with a header row) into
 * reorder rows. Rows with no product name AND no cost are dropped (blank/total lines).
 */
export function parseSupplyNeedsCsv(text: string): SupplyNeedRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);

  const productIdx = findColumn(headers, PRODUCT_KEYS);
  const supplierIdx = findColumn(headers, SUPPLIER_KEYS);
  const qtyIdx = findColumn(headers, QTY_KEYS);
  const costTotalIdx = findColumn(headers, COST_TOTAL_KEYS);
  const costAnyIdx = costTotalIdx >= 0 ? costTotalIdx : findColumn(headers, COST_ANY_KEYS);

  const rows: SupplyNeedRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const productName = (productIdx >= 0 ? cells[productIdx] : cells[0] ?? "").trim();
    const supplier = (supplierIdx >= 0 ? cells[supplierIdx] ?? "" : "").trim();
    const orderQuantity = qtyIdx >= 0 ? parseMoney(cells[qtyIdx] ?? "") : 0;
    const lineCost = costAnyIdx >= 0 ? parseMoney(cells[costAnyIdx] ?? "") : 0;
    // Drop separator/total/blank rows: keep only rows that name a product OR carry cost.
    if (!productName && lineCost === 0) continue;
    if (/^(total|รวม|ยอดรวม|grand total)/i.test(productName)) continue;
    rows.push({ productName, supplier, orderQuantity, lineCost });
  }
  return rows;
}

/** Sum line costs and decide whether the alert threshold is reached. */
export function summariseReorder(rows: SupplyNeedRow[], threshold = DEFAULT_REORDER_THRESHOLD_THB): ReorderSummary {
  const totalCost = rows.reduce((sum, row) => sum + (Number.isFinite(row.lineCost) ? row.lineCost : 0), 0);
  const rounded = Math.round(totalCost * 100) / 100;
  return {
    rows,
    totalCost: rounded,
    itemCount: rows.length,
    threshold,
    reached: rounded >= threshold
  };
}

function formatThb(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Title for the assigned reorder task (shows the total so staff sees urgency at a glance). */
export function buildReorderTitle(summary: ReorderSummary): string {
  return `🛒 สั่งสินค้าเติมสต็อก (ยอด ฿${formatThb(summary.totalCost)})`;
}

/**
 * Detail body listing what to order — pasted into the assignment so the on-shift staff
 * can order straight from the list without opening StoreHub separately. Caps the printed
 * list so a huge export doesn't blow past Firestore's 1MB doc limit.
 */
export function buildReorderDetail(summary: ReorderSummary, maxRows = 60): string {
  const header =
    `รายการที่ต้องสั่งซื้อ ${summary.itemCount} รายการ · ยอดต้นทุนรวม ฿${formatThb(summary.totalCost)} ` +
    `(ถึงเกณฑ์แจ้งเตือน ฿${formatThb(summary.threshold)})`;
  const shown = summary.rows.slice(0, maxRows);
  const lines = shown.map((row, i) => {
    const qty = row.orderQuantity ? ` · สั่ง ${formatThb(row.orderQuantity)}` : "";
    const supplier = row.supplier ? ` · ${row.supplier}` : "";
    const cost = row.lineCost ? ` · ฿${formatThb(row.lineCost)}` : "";
    return `${i + 1}. ${row.productName || "(ไม่ระบุชื่อ)"}${qty}${supplier}${cost}`;
  });
  const more = summary.rows.length > maxRows ? [`… และอีก ${summary.rows.length - maxRows} รายการ (ดูรายการเต็มใน StoreHub)`] : [];
  const footer = "อ้างอิง: StoreHub → ความต้องการเติมสต็อก (Supply Needs) · สั่งครบแล้วแนบหลักฐาน/สลิปก่อนส่งงาน";
  return [header, "", ...lines, ...more, "", footer].join("\n");
}
