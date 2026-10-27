// Nightly inventory snapshot (Masterplan Mission C: stockout days, average stock, stock age,
// turnover). Pure helpers only — the route that calls StoreHub and writes Firestore lives in
// app/api/storehub/inventory-snapshot/route.ts.
//
// Firestore: sop_inventory_snapshots/{branch}__{YYYY-MM-DD}  (Bangkok date)
//   { branch, date, takenAt, storeId, count, items: { [productId]: quantityOnHand }, part, parts }
// Quantities only — no prices/costs. A doc must stay < 1 MiB; if a branch ever grows past
// SNAPSHOT_PART_BYTES the items are split across {id}, {id}__part2, … and mergeSnapshotParts()
// glues them back together. One run per day overwrites the same ids (idempotent).

export const SNAPSHOT_COLLECTION = "sop_inventory_snapshots";
/** Leave headroom under Firestore's 1 MiB doc limit (field names + metadata + index overhead). */
export const SNAPSHOT_PART_BYTES = 800_000;

export type SnapshotItems = Record<string, number>;

export type InventorySnapshotDoc = {
  branch: string;
  date: string;
  takenAt: number;
  storeId: string;
  /** rows in the whole snapshot (all parts) */
  count: number;
  items: SnapshotItems;
  /** 1-based part number; 1 = the main doc */
  part: number;
  parts: number;
};

/** A day's snapshot for one branch after merging parts. */
export type DaySnapshot = { date: string; items: SnapshotItems };

export function bangkokDate(ms: number): string {
  return new Date(ms + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function snapshotId(branch: string, date: string, part = 1): string {
  return part <= 1 ? `${branch}__${date}` : `${branch}__${date}__part${part}`;
}

/** StoreHub /inventory rows → { productId: qty }. Keeps zero/negative qty (that IS the stockout signal). */
export function compactInventory(rows: { productId?: string; quantityOnHand?: number }[]): SnapshotItems {
  const items: SnapshotItems = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.productId || row.productId.includes("/")) continue;
    const qty = Number(row.quantityOnHand);
    items[row.productId] = Number.isFinite(qty) ? qty : 0;
  }
  return items;
}

/** Rough serialized size in bytes (UTF-8 JSON) — close enough to Firestore's own estimate for ASCII ids. */
export function estimateBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

/** Builds the doc(s) to write for one branch/day. Splits only when the items would get too big. */
export function buildSnapshotDocs(input: {
  branch: string;
  storeId: string;
  date: string;
  takenAt: number;
  items: SnapshotItems;
  maxBytes?: number;
}): { id: string; data: InventorySnapshotDoc }[] {
  const maxBytes = input.maxBytes ?? SNAPSHOT_PART_BYTES;
  const entries = Object.entries(input.items);
  const chunks: [string, number][][] = [];
  let current: [string, number][] = [];
  let bytes = 0;
  for (const entry of entries) {
    const size = entry[0].length + String(entry[1]).length + 6;
    if (current.length && bytes + size > maxBytes) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(entry);
    bytes += size;
  }
  chunks.push(current);
  return chunks.map((chunk, index) => ({
    id: snapshotId(input.branch, input.date, index + 1),
    data: {
      branch: input.branch,
      date: input.date,
      takenAt: input.takenAt,
      storeId: input.storeId,
      count: entries.length,
      items: Object.fromEntries(chunk),
      part: index + 1,
      parts: chunks.length
    }
  }));
}

/** Reader side: group docs by (branch, date) and merge their parts. Incomplete days are dropped. */
export function mergeSnapshotParts(docs: InventorySnapshotDoc[]): Map<string, DaySnapshot[]> {
  const byKey = new Map<string, InventorySnapshotDoc[]>();
  for (const doc of docs) {
    const key = `${doc.branch}__${doc.date}`;
    byKey.set(key, [...(byKey.get(key) ?? []), doc]);
  }
  const byBranch = new Map<string, DaySnapshot[]>();
  for (const parts of byKey.values()) {
    const expected = parts[0].parts || 1;
    if (new Set(parts.map((p) => p.part || 1)).size < expected) continue;
    const items: SnapshotItems = {};
    for (const part of parts) Object.assign(items, part.items);
    const { branch, date } = parts[0];
    byBranch.set(branch, [...(byBranch.get(branch) ?? []), { date, items }]);
  }
  for (const list of byBranch.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  return byBranch;
}

/**
 * Days in `month` (YYYY-MM) each product sat at qty <= 0, counted over the snapshots that exist.
 * A product missing from a day's snapshot counts as 0 on hand (StoreHub lists every tracked item).
 */
export function stockoutDays(series: DaySnapshot[], productIds: string[], month: string): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(productIds.map((id) => [id, 0]));
  for (const day of series) {
    if (!day.date.startsWith(`${month}-`)) continue;
    for (const id of productIds) if ((day.items[id] ?? 0) <= 0) out[id] += 1;
  }
  return out;
}

/** Number of snapshot days in a month — the denominator for a stockout-day rate. */
export function snapshotDaysInMonth(series: DaySnapshot[], month: string): number {
  return new Set(series.filter((d) => d.date.startsWith(`${month}-`)).map((d) => d.date)).size;
}

/**
 * Average on-hand per product across the given snapshots (negative = oversold → treated as 0).
 * Turnover = units sold ÷ averageStock over the same window.
 */
export function averageStock(series: DaySnapshot[], productIds?: string[]): Record<string, number> {
  if (!series.length) return {};
  const ids = productIds ?? [...new Set(series.flatMap((d) => Object.keys(d.items)))];
  const out: Record<string, number> = {};
  for (const id of ids) {
    let sum = 0;
    for (const day of series) sum += Math.max(0, day.items[id] ?? 0);
    out[id] = Math.round((sum / series.length) * 100) / 100;
  }
  return out;
}

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T12:00:00+07:00`) / 86_400_000);
}

/**
 * Stock age (C4e): days since the LATER of the last sale and the last receipt.
 * Returns null when neither date is known (age can't be measured yet).
 */
export function lastSaleOrReceiptAge(input: { lastSaleDate?: string | null; lastReceiptDate?: string | null; today: string }): number | null {
  const dates = [input.lastSaleDate, input.lastReceiptDate].filter((d): d is string => Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d)));
  if (!dates.length) return null;
  const latest = dates.sort().at(-1) as string;
  return Math.max(0, dayNumber(input.today) - dayNumber(latest));
}

/** On-hand for a product from the latest snapshot strictly before `date` (null if none). */
export function onHandBefore(series: DaySnapshot[], productId: string, date: string): number | null {
  let found: number | null = null;
  for (const day of series) {
    if (day.date >= date) break;
    found = day.items[productId] ?? 0;
  }
  return found;
}
