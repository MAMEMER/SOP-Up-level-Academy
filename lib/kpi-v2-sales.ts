export type SaleProduct = { id?: string; category?: string };
export type SaleTransaction = { refId?: string; employeeId?: string; storeId?: string; transactionTime?: string; transactionType?: string; isCancelled?: boolean; status?: string; total?: number; items?: { productId?: string; total?: number }[] };

/** All products on a sale must be identified, otherwise a partial total would look authoritative. */
export function salesByStaff(transactions: SaleTransaction[], products: SaleProduct[], cashiers: Record<string, string>, from: number, to: number, stores: Set<string>): Record<string, number> {
  const categories = new Map(products.filter((p) => p.id).map((p) => [p.id!, String(p.category || "").trim().toLowerCase()]));
  const totals: Record<string, number> = {};
  const seen = new Set<string>();
  for (const transaction of transactions) {
    if (transaction.transactionType !== "Sale" || transaction.isCancelled || String(transaction.status || "").toLowerCase() === "cancelled" || !stores.has(transaction.storeId || "")) continue;
    const at = Date.parse(transaction.transactionTime || "");
    if (!Number.isFinite(at) || at < from || at >= to) continue;
    if (!transaction.refId) throw new Error("missing_transaction_id");
    if (seen.has(transaction.refId)) continue;
    seen.add(transaction.refId);
    const code = cashiers[String(transaction.employeeId || "")];
    if (!code) throw new Error("unmapped_cashier");
    if (!Array.isArray(transaction.items) || !Number.isFinite(transaction.total)) throw new Error("incomplete_sale");
    let excluded = 0;
    for (const item of transaction.items) {
      if (!item.productId || !categories.has(item.productId) || !Number.isFinite(item.total)) throw new Error("unknown_product");
      if (["pre order", "event"].includes(categories.get(item.productId)!)) excluded += Math.max(0, item.total!);
    }
    totals[code] = (totals[code] || 0) + Math.max(0, transaction.total! - excluded);
  }
  return totals;
}
