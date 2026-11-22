import { test } from "node:test";
import { strict as assert } from "node:assert";
import { pace, salesProgress } from "../lib/team-targets.ts";
test("pace excludes today from remaining days and forecasts the full month", () => {
  assert.deepEqual(pace(50000, 200000, 10, 30), { percent: 25, remaining: 150000, remainingDays: 20, neededPerDay: 7500, forecast: 150000 });
  assert.equal(pace(250, 200, 30, 30).neededPerDay, null);
  assert.equal(pace(250, 200, 30, 30).remaining, 0);
  assert.equal(pace(0, 0, 1, 31).percent, null);
});
test("sales exclude preorder and other non-product lines and include online events", () => {
  const result = salesProgress("2026-11", "2026-11-02", [{ storeId: "6a268170c008ab000760e21a", transactionTime: "2026-11-01T18:00:00Z", total: 170, items: [{ productId: "p", total: 100 }, { productId: "e", total: 30 }, { productId: "pre", total: 40 }] }], [{ id: "p" }, { id: "e", name: "Gym" }, { id: "pre", name: "พรี" }], [{ status: "verified", date: "2026-11-02", amount: 20 }]);
  assert.equal(result.product, 100); assert.equal(result.event, 50); assert.equal(result.store, 150); assert.equal(result.branches.online, 20);
});
