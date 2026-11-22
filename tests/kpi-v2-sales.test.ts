import { test } from "node:test";
import assert from "node:assert/strict";
import { salesByStaff } from "../lib/kpi-v2-sales.ts";
const from = Date.parse("2026-12-01T00:00:00Z"), to = Date.parse("2027-01-01T00:00:00Z");
const stores = new Set(["shop"]), cashiers = { x: "A" };
const products = [{ id: "a", category: "Cards" }, { id: "b", category: "Event" }, { id: "c", category: "Pre order" }];
const sale = { refId: "1", employeeId: "x", storeId: "shop", transactionTime: "2026-12-05T00:00:00Z", transactionType: "Sale", total: 100, items: [{ productId: "a", total: 70 }, { productId: "b", total: 20 }, { productId: "c", total: 10 }] };
test("counts only eligible sale items once for the mapped cashier", () => {
  assert.deepEqual(salesByStaff([sale, sale, { ...sale, refId: "2", isCancelled: true }], products, cashiers, from, to, stores), { A: 70 });
});
test("does not silently calculate incomplete or unmapped sales", () => {
  assert.throws(() => salesByStaff([sale], products, {}, from, to, stores));
  assert.throws(() => salesByStaff([{ ...sale, items: [{ productId: "unknown", total: 1 }] }], products, cashiers, from, to, stores));
});
