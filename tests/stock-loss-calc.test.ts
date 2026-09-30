import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStockLoss, isSnackOrDrink, type StockCount, type SaleLine } from "../lib/stock-loss-calc.ts";

const H = 60 * 60 * 1000;
const c = (h: number, expected: number, counted: number, sku = "drink01"): StockCount => ({
  sku,
  name: "Coke",
  at: h * H,
  expected,
  counted
});
const sale = (h: number, qty = 1, sku = "drink01"): SaleLine => ({ sku, at: h * H, qty, total: qty * 18 });

test("plain shrink = start − end − sold, valued at the real sale price", () => {
  const r = computeStockLoss([c(0, 10, 10), c(12, 9, 8), c(24, 7, 7)], [sale(5), sale(15)], { drink01: 20 }, 0, 30 * H);
  assert.equal(r.totalQty, 1);
  assert.equal(r.totalValue, 18);
  assert.equal(r.totalLabel, 20);
});

test("a mistyped count that the next round corrects is not a loss", () => {
  const r = computeStockLoss([c(0, 67, 67), c(12, 67, 39), c(24, 41, 67), c(36, 67, 67)], [], {}, 0, 40 * H);
  assert.equal(r.totalQty, 0);
  assert.equal(r.typos, 1);
});

test("a receipt keyed into StoreHub adds stock instead of hiding a loss", () => {
  const r = computeStockLoss([c(0, 5, 5), c(12, 29, 29), c(24, 29, 27)], [], {}, 0, 30 * H);
  assert.equal(r.rows[0].received, 24);
  assert.equal(r.totalQty, 2);
});

test("an undercount found again within 3 days is not a loss", () => {
  const r = computeStockLoss([c(0, 16, 16), c(12, 16, 10), c(24, 10, 10), c(36, 10, 16), c(48, 16, 16)], [], {}, 0, 50 * H);
  assert.equal(r.totalQty, 0);
});

test("a stock jump with no receipt counts as unrecorded stock, never negative loss", () => {
  const r = computeStockLoss([c(0, 2, 2), c(12, 2, 14), c(24, 14, 14)], [], {}, 0, 30 * H);
  assert.equal(r.totalQty, 0);
  assert.equal(r.rows[0].unrecorded, 12);
});

test("only snacks/drinks, never instant noodles", () => {
  assert.equal(isSnackOrDrink("drink05", "Water"), true);
  assert.equal(isSnackOrDrink("snack11", "มาม่าหมูสับ สีเหลือง"), false);
  assert.equal(isSnackOrDrink("PKM-001", "Booster"), false);
});
