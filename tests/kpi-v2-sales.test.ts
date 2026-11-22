import { test } from "node:test";
import assert from "node:assert/strict";
import { saleRows, salesTargets } from "../lib/kpi-v2-sales.ts";
const from = Date.parse("2026-12-01T00:00:00Z"), to = Date.parse("2027-01-01T00:00:00Z");
const sale = { refId: "1", employeeId: "x", storeId: "shop", transactionTime: "2026-12-05T00:00:00Z", transactionType: "Sale", total: 100, items: [{ productId: "a", total: 60 }, { productId: "b", total: 20 }, { productId: "c", total: 10 }, { productId: "d", total: 10 }] };
const products = [{ id: "a", category: "Cards" }, { id: "b", category: "Event" }, { id: "c", category: "Pre order" }, { id: "d", name: "Pre release ticket" }];
test("filters sales and preserves unmapped sales separately", () => {
  const rows = saleRows([sale, sale, { ...sale, refId: "2", isCancelled: true }, { ...sale, refId: "3", employeeId: "generic" }], products, { x: "A" }, from, to, { shop: "bangkae" });
  assert.deepEqual(rows.map(r => [r.staffCode, r.amount]), [["A", 60], [undefined, 60]]);
  assert.throws(() => saleRows([{ ...sale, items: [{ productId: "missing", total: 1 }] }], products, {}, from, to, { shop: "bangkae" }));
});
test("eight-week averages, growth, duplicates and missing bucket", () => {
  const shifts = [{ staffCode: "A", branch: "bangkae", workDate: "2026-11-30" }, { staffCode: "A", branch: "bangkae", workDate: "2026-11-30" }, ...Array.from({ length: 26 }, (_, i) => ({ staffCode: `P${i}`, branch: "bangkae", workDate: "2026-12-07" }))];
  const rows = [{ staffCode: "A", branch: "bangkae", workDate: "2026-11-30", amount: 734 }];
  const result = salesTargets(shifts, rows, "2026-12", 10);
  assert.equal(result.buckets["bangkae:weekday"].shifts, 1);
  assert.ok(Math.abs(result.people.P0.target! - 807.4) < 1e-9);
  assert.equal(result.people.P0.shifts, 1);
  assert.equal(salesTargets([{ staffCode: "A", branch: "bangkae", workDate: "2026-12-06" }], [], "2026-12", 10).people.A.target, undefined);
});
test("monthly target adds the correct bucket for each scheduled shift", () => {
  const history = [
    { staffCode: "A", branch: "bangkae", workDate: "2026-11-30", amount: 734 },
    { staffCode: "A", branch: "bangkae", workDate: "2026-11-29", amount: 676 },
    { staffCode: "C", branch: "senafest", workDate: "2026-11-30", amount: 1884 },
    { staffCode: "C", branch: "senafest", workDate: "2026-11-29", amount: 1665 }
  ];
  const shifts = history.map(({ staffCode, branch, workDate }) => ({ staffCode, branch, workDate }));
  for (let i = 1; i <= 31; i++) { const date = `2026-12-${String(i).padStart(2, "0")}`; shifts.push({ staffCode: "B", branch: "bangkae", workDate: date }); }
  const result = salesTargets(shifts, history, "2026-12", 10);
  assert.equal(result.buckets["senafest:weekend"].target, 1665 * 1.1);
  assert.ok(Math.abs(result.people.B.target! - (23 * 734 + 8 * 676) * 1.1) < 1e-8);
});
