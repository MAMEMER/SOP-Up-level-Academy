export type SaleProduct = { id?: string; category?: string; name?: string };
export type SaleTransaction = { refId?: string; employeeId?: string; storeId?: string; transactionTime?: string; transactionType?: string; isCancelled?: boolean; status?: string; total?: number; items?: { productId?: string; total?: number }[] };
export type SaleRow = { staffCode?: string; branch: string; workDate: string; amount: number; storeRevenue?: number; openPrice?: number };
export function classifySaleProduct(product: SaleProduct): "preorder" | "event" | "membership" | "open_price" | "product" {
  const name = product.name || "", category = (product.category || "").trim().toLowerCase();
  if (category === "pre order" || /pre ?-?order|พรี/i.test(name)) return "preorder";
  if (category === "event" || /pre release|event|tournam|gym|ค่าบริการบอร์ดเกม|road to/i.test(name)) return "event";
  if (name.includes("สมัคร สมาชิก")) return "membership";
  if (name.includes("ขายได้ทุกอย่าง")) return "open_price";
  return "product";
}
export function saleRows(transactions: SaleTransaction[], products: SaleProduct[], cashiers: Record<string, string>, from: number, to: number, stores: Record<string, string>): SaleRow[] {
  const catalog = new Map(products.filter(p => p.id).map(p => [p.id!, p]));
  const seen = new Set<string>();
  const rows: SaleRow[] = [];
  for (const t of transactions) {
    if (t.transactionType !== "Sale" || t.isCancelled || String(t.status || "").toLowerCase() === "cancelled" || !stores[t.storeId || ""]) continue;
    const at = Date.parse(t.transactionTime || "");
    if (!Number.isFinite(at) || at < from || at >= to) continue;
    if (!t.refId) throw new Error("missing_transaction_id");
    if (seen.has(t.refId)) continue;
    seen.add(t.refId);
    if (!Array.isArray(t.items) || !Number.isFinite(t.total)) throw new Error("incomplete_sale");
    let excluded = 0, preorder = 0, openPrice = 0;
    for (const item of t.items) {
      const product = item.productId && catalog.get(item.productId);
      if (!product || !Number.isFinite(item.total)) throw new Error("unknown_product");
      const kind = classifySaleProduct(product), amount = Math.max(0, item.total!);
      if (kind !== "product") excluded += amount;
      if (kind === "preorder") preorder += amount;
      if (kind === "open_price") openPrice += amount;
    }
    rows.push({ staffCode: cashiers[String(t.employeeId || "")], branch: stores[t.storeId!], workDate: new Date(at + 7 * 3600000).toISOString().slice(0, 10), amount: Math.max(0, t.total! - excluded), storeRevenue: Math.max(0, t.total! - preorder), openPrice });
  }
  return rows;
}
export type Shift = { staffCode: string; workDate: string; branch: string };
export function bucketKey(branch: string, date: string): string { const day = new Date(`${date}T00:00:00Z`).getUTCDay(); return `${branch}:${day === 0 || day === 6 ? "weekend" : "weekday"}`; }
export function salesTargets(shifts: Shift[], sales: SaleRow[], period: string, growthPct: number) {
  const start = `${period}-01`;
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const historyStart = new Date(startMs - 56 * 86400000).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 1)).toISOString().slice(0, 10);
  const unique = new Map<string, Shift>();
  for (const shift of shifts) if (shift.staffCode && shift.branch && shift.workDate >= historyStart && shift.workDate < end) { const key = `${shift.staffCode}:${shift.workDate}`; if (!unique.has(key)) unique.set(key, shift); }
  const history = [...unique.values()].filter(s => s.workDate < start);
  const buckets: Record<string, { sales: number; shifts: number; target: number }> = {};
  const indexedSales = new Map<string, number>();
  for (const row of sales) if (row.staffCode && row.workDate >= historyStart && row.workDate < start) { const key = `${row.staffCode}:${row.workDate}:${row.branch}`; indexedSales.set(key, (indexedSales.get(key) || 0) + row.amount); }
  for (const shift of history) { const key = bucketKey(shift.branch, shift.workDate); const bucket = buckets[key] ||= { sales: 0, shifts: 0, target: 0 }; bucket.shifts++; bucket.sales += indexedSales.get(`${shift.staffCode}:${shift.workDate}:${shift.branch}`) || 0; }
  for (const bucket of Object.values(buckets)) bucket.target = bucket.sales / bucket.shifts * (1 + growthPct / 100);
  const people: Record<string, { shifts: number; target?: number }> = {};
  for (const shift of unique.values()) if (shift.workDate >= start) { const person = people[shift.staffCode] ||= { shifts: 0, target: 0 }; person.shifts++; const bucket = buckets[bucketKey(shift.branch, shift.workDate)]; if (!bucket || person.target === undefined) person.target = undefined; else person.target += bucket.target; }
  return { buckets, people };
}
