// รับของเข้า (receiving log) + moving-average cost — pure logic, no I/O (tests/receivings.test.ts).
//
// Flow: admin records a bill (branch, date, dealer, bill no, bill photo, lines of product+qty).
// Only an owner (lib/owner.ts isOwner) sees or sets unit costs. The owner fills costs and
// presses "ยืนยัน" → each shop-owned line updates sop_product_costs/{productId}:
//   newAvg = (oldAvg × max(onHand,0) + qty × unitCost) ÷ (max(onHand,0) + qty)
// where onHand = shop-wide on-hand from the latest nightly snapshot BEFORE the receipt date
// (live inventory when no snapshot exists). That on-hand is frozen onto the receiving
// (`onHandBasis`) at confirm time, so the cost table can be rebuilt deterministically.
//
// Idempotent: a receiving with appliedAt set is never applied twice.
// Cancel (owner + reason): the receiving is marked ยกเลิก and every affected product's cost
// is RECOMPUTED from scratch by replaying all remaining confirmed receivings in date order
// with their frozen onHandBasis. Simplest correct rollback; no reverse-arithmetic drift.
//
// Lines owned by "champ" (Champ's personal single cards on consignment) are logged but never
// touch the shop's cost table or stock value.

export const RECEIVINGS_COLLECTION = "sop_receivings";
export const PRODUCT_COSTS_COLLECTION = "sop_product_costs";
export const COST_HISTORY_LIMIT = 20;

export const STATUS_PENDING = "รอใส่ทุน";
export const STATUS_CONFIRMED = "ยืนยันแล้ว";
export const STATUS_CANCELLED = "ยกเลิก";
export type ReceivingStatus = typeof STATUS_PENDING | typeof STATUS_CONFIRMED | typeof STATUS_CANCELLED;

export type LineOwner = "shop" | "champ";
export const LINE_OWNER_LABEL: Record<LineOwner, string> = { shop: "ร้าน", champ: "แชมป์ (ฝากขาย)" };

export type ReceivingLine = {
  productId: string;
  sku: string;
  name: string;
  qty: number;
  /** ต้นทุนต่อชิ้นก่อน VAT — null จนกว่าเจ้าของจะใส่ (และถูกลบออกก่อนส่งให้คนที่ไม่ใช่เจ้าของ) */
  unitCostExVat: number | null;
  owner: LineOwner;
};

export type Receiving = {
  id: string;
  branch: string;
  date: string;
  dealer: string;
  billNo: string;
  billPhotoUrl: string;
  lines: ReceivingLine[];
  status: ReceivingStatus;
  note?: string;
  createdBy: string;
  createdAt: number;
  approvedBy?: string;
  approvedAt?: number;
  /** set once the costs were written to sop_product_costs — guards against double-apply */
  appliedAt?: number;
  /** productId → shop-wide on-hand used as the moving-average basis (frozen at confirm) */
  onHandBasis?: Record<string, number>;
  cancelledBy?: string;
  cancelledAt?: number;
  cancelReason?: string;
};

export type CostHistoryEntry = { date: string; qty: number; unitCost: number; receivingId: string; onHandBefore: number };

export type ProductCost = {
  productId: string;
  avgCost: number;
  /** on-hand used for the latest update (after max(…,0)) */
  onHandBasis: number;
  lastReceiptDate: string;
  lastUnitCost: number;
  history: CostHistoryEntry[];
  updatedAt: number;
};

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** The moving-average step. Negative/unknown on-hand counts as 0 (oversold stock has no cost basis). */
export function movingAverage(oldAvg: number | null | undefined, onHand: number | null | undefined, qty: number, unitCost: number): number {
  const base = Math.max(Number(onHand) || 0, 0);
  if (oldAvg == null || !Number.isFinite(oldAvg) || base === 0) return round4(unitCost);
  const total = base + qty;
  if (total <= 0) return round4(unitCost);
  return round4((oldAvg * base + qty * unitCost) / total);
}

/** Shop lines that move the cost table. */
export function costLines(receiving: Pick<Receiving, "lines">): ReceivingLine[] {
  return receiving.lines.filter((line) => line.owner !== "champ" && line.qty > 0);
}

export function receivingTotal(receiving: Pick<Receiving, "lines">): number | null {
  let sum = 0;
  for (const line of costLines(receiving)) {
    if (line.unitCostExVat == null) return null;
    sum += line.qty * line.unitCostExVat;
  }
  return Math.round(sum * 100) / 100;
}

/** Applies one receiving on top of the current costs. Lines for the same product chain (2nd line sees 1st's qty). */
export function applyReceivingToCosts(
  costs: Record<string, ProductCost | null | undefined>,
  receiving: Receiving,
  onHandBasis: Record<string, number>,
  now: number
): Record<string, ProductCost> {
  const out: Record<string, ProductCost> = {};
  const extraOnHand: Record<string, number> = {};
  for (const line of costLines(receiving)) {
    if (line.unitCostExVat == null) continue;
    const prev = out[line.productId] ?? costs[line.productId] ?? null;
    const onHand = Math.max(onHandBasis[line.productId] ?? 0, 0) + (extraOnHand[line.productId] ?? 0);
    const avgCost = movingAverage(prev?.avgCost ?? null, onHand, line.qty, line.unitCostExVat);
    const entry: CostHistoryEntry = { date: receiving.date, qty: line.qty, unitCost: line.unitCostExVat, receivingId: receiving.id, onHandBefore: onHand };
    out[line.productId] = {
      productId: line.productId,
      avgCost,
      onHandBasis: onHand,
      lastReceiptDate: receiving.date,
      lastUnitCost: line.unitCostExVat,
      history: [...(prev?.history ?? []), entry].slice(-COST_HISTORY_LIMIT),
      updatedAt: now
    };
    extraOnHand[line.productId] = (extraOnHand[line.productId] ?? 0) + line.qty;
  }
  return out;
}

export type ConfirmResult =
  | { error: string }
  | { alreadyApplied: true; receiving: Receiving }
  | { receiving: Receiving; costs: Record<string, ProductCost> };

/** Owner confirms: every shop line needs a cost. Already-applied → no-op (idempotent). */
export function confirmReceiving(
  receiving: Receiving,
  costs: Record<string, ProductCost | null | undefined>,
  onHandBasis: Record<string, number>,
  by: string,
  now: number
): ConfirmResult {
  if (receiving.appliedAt || receiving.status === STATUS_CONFIRMED) return { alreadyApplied: true, receiving };
  if (receiving.status === STATUS_CANCELLED) return { error: "รายการนี้ยกเลิกแล้ว" };
  const missing = costLines(receiving).filter((line) => line.unitCostExVat == null || !(line.unitCostExVat >= 0));
  if (missing.length) return { error: `ยังไม่ได้ใส่ทุน ${missing.length} รายการ` };
  const basis: Record<string, number> = {};
  for (const line of costLines(receiving)) basis[line.productId] = Math.max(onHandBasis[line.productId] ?? 0, 0);
  const updated = applyReceivingToCosts(costs, receiving, basis, now);
  return {
    receiving: { ...receiving, status: STATUS_CONFIRMED, approvedBy: by, approvedAt: now, appliedAt: now, onHandBasis: basis },
    costs: updated
  };
}

function receivingOrder(a: Receiving, b: Receiving): number {
  return a.date.localeCompare(b.date) || (a.appliedAt ?? 0) - (b.appliedAt ?? 0) || a.id.localeCompare(b.id);
}

/**
 * Rebuilds the cost rows for `productIds` from all confirmed receivings (date order, frozen basis).
 * A product with no remaining confirmed receipts → null (its cost doc should be deleted).
 */
export function recomputeCosts(receivings: Receiving[], productIds: string[], now: number): Record<string, ProductCost | null> {
  const wanted = new Set(productIds);
  let costs: Record<string, ProductCost> = {};
  const confirmed = receivings.filter((r) => r.status === STATUS_CONFIRMED && r.appliedAt).sort(receivingOrder);
  for (const receiving of confirmed) {
    const relevant = { ...receiving, lines: receiving.lines.filter((line) => wanted.has(line.productId)) };
    if (!costLines(relevant).length) continue;
    costs = { ...costs, ...applyReceivingToCosts(costs, relevant, receiving.onHandBasis ?? {}, now) };
  }
  return Object.fromEntries(productIds.map((id) => [id, costs[id] ?? null]));
}

export type CancelResult = { error: string } | { receiving: Receiving; costs: Record<string, ProductCost | null> };

/** Owner cancels with a reason. Confirmed → costs of its products are recomputed without it. */
export function cancelReceiving(target: Receiving, all: Receiving[], reason: string, by: string, now: number): CancelResult {
  if (target.status === STATUS_CANCELLED) return { error: "ยกเลิกไปแล้ว" };
  if (!reason.trim()) return { error: "ต้องใส่เหตุผลที่ยกเลิก" };
  const cancelled: Receiving = { ...target, status: STATUS_CANCELLED, cancelledBy: by, cancelledAt: now, cancelReason: reason.trim().slice(0, 300) };
  if (!target.appliedAt) return { receiving: cancelled, costs: {} };
  const productIds = [...new Set(costLines(target).map((line) => line.productId))];
  const rest = all.map((r) => (r.id === target.id ? cancelled : r));
  return { receiving: cancelled, costs: recomputeCosts(rest, productIds, now) };
}

/** What a non-owner may see: no unit costs, no cost basis. */
export function redactForViewer(receiving: Receiving, owner: boolean): Receiving {
  if (owner) return receiving;
  const { onHandBasis: _basis, ...rest } = receiving;
  return { ...rest, lines: receiving.lines.map((line) => ({ ...line, unitCostExVat: null })) };
}

export type ReceivingInput = {
  branch?: unknown;
  date?: unknown;
  dealer?: unknown;
  billNo?: unknown;
  billPhotoUrl?: unknown;
  note?: unknown;
  lines?: unknown;
};

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function parseCost(v: unknown): number | null | "bad" {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return "bad";
  return Math.round(n * 10000) / 10000;
}

/**
 * Validates a new receiving. Non-owners can never set a cost (silently dropped server-side,
 * so a crafted request can't plant one). Bill photo is required — it's the audit trail.
 */
export function parseReceivingInput(
  input: ReceivingInput,
  opts: { owner: boolean; branches: string[] }
): { error: string } | { value: Omit<Receiving, "id" | "status" | "createdBy" | "createdAt"> } {
  const branch = str(input.branch, 40);
  if (!opts.branches.includes(branch)) return { error: "เลือกสาขา" };
  const date = str(input.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "วันที่ไม่ถูกต้อง" };
  const dealer = str(input.dealer, 120);
  if (!dealer) return { error: "ใส่ชื่อร้าน/ดีลเลอร์" };
  const billPhotoUrl = str(input.billPhotoUrl, 1000);
  if (!/^https:\/\//.test(billPhotoUrl)) return { error: "แนบรูปบิลก่อน" };
  if (!Array.isArray(input.lines) || !input.lines.length) return { error: "ยังไม่มีสินค้า" };
  if (input.lines.length > 300) return { error: "สินค้าเยอะเกิน แยกเป็นหลายบิล" };
  const lines: ReceivingLine[] = [];
  for (const raw of input.lines as Record<string, unknown>[]) {
    const productId = str(raw?.productId, 80);
    if (!productId || productId.includes("/")) return { error: "มีสินค้าที่ไม่ได้เลือกจากรายการ" };
    const qty = Number(raw?.qty);
    if (!Number.isInteger(qty) || qty <= 0 || qty > 100_000) return { error: "จำนวนต้องเป็นเลขเต็มมากกว่า 0" };
    const owner: LineOwner = raw?.owner === "champ" ? "champ" : "shop";
    let unitCostExVat: number | null = null;
    if (opts.owner && owner === "shop") {
      const cost = parseCost(raw?.unitCostExVat);
      if (cost === "bad") return { error: "ทุนต่อชิ้นไม่ถูกต้อง" };
      unitCostExVat = cost;
    }
    lines.push({ productId, sku: str(raw?.sku, 80), name: str(raw?.name, 200), qty, unitCostExVat, owner });
  }
  return { value: { branch, date, dealer, billNo: str(input.billNo, 60), billPhotoUrl, note: str(input.note, 500), lines } };
}

/** Owner edits costs on a pending receiving: { productId+index → cost }. */
export function applyCostEdits(receiving: Receiving, costs: unknown[]): { error: string } | { receiving: Receiving } {
  if (receiving.status !== STATUS_PENDING) return { error: "แก้ทุนได้เฉพาะรายการที่รอใส่ทุน" };
  if (!Array.isArray(costs) || costs.length !== receiving.lines.length) return { error: "จำนวนรายการไม่ตรง" };
  const lines: ReceivingLine[] = [];
  for (let i = 0; i < receiving.lines.length; i++) {
    const line = receiving.lines[i];
    if (line.owner === "champ") {
      lines.push({ ...line, unitCostExVat: null });
      continue;
    }
    const cost = parseCost(costs[i]);
    if (cost === "bad") return { error: `ทุนบรรทัดที่ ${i + 1} ไม่ถูกต้อง` };
    lines.push({ ...line, unitCostExVat: cost });
  }
  return { receiving: { ...receiving, lines } };
}

/** Recent dealer names for the datalist (most recent first, unique). */
export function recentDealers(receivings: Receiving[], limit = 12): string[] {
  const seen = new Set<string>();
  for (const r of [...receivings].sort((a, b) => b.createdAt - a.createdAt)) {
    if (r.dealer && !seen.has(r.dealer)) seen.add(r.dealer);
    if (seen.size >= limit) break;
  }
  return [...seen];
}

export type ProductOption = { id: string; name: string; sku: string; barcode: string };

/** Search the StoreHub catalogue by name / SKU / barcode. Exact SKU/barcode first, then prefix, then contains. */
export function searchProducts(products: ProductOption[], query: string, limit = 30): ProductOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const scored: { p: ProductOption; score: number }[] = [];
  for (const p of products) {
    const sku = p.sku.toLowerCase();
    const barcode = p.barcode.toLowerCase();
    const name = p.name.toLowerCase();
    let score = 0;
    if (sku === q || barcode === q) score = 100;
    else if (sku.startsWith(q) || barcode.startsWith(q)) score = 60;
    else if (terms.every((t) => name.includes(t) || sku.includes(t))) score = name.startsWith(terms[0]) ? 40 : 20;
    if (score) scored.push({ p, score });
  }
  scored.sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name));
  return scored.slice(0, limit).map((s) => s.p);
}
