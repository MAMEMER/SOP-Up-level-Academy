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

test("product target includes membership and paid online orders, excluding event and preorder", async () => {
  const { calculateActuals, incentivePool } = await import("../lib/team-targets.ts");
  const tx = [{ storeId: "6a268170c008ab000760e21a", transactionTime: "2026-11-02T00:00:00Z", total: 260, items: [{ productId: "member", total: 50 }, { productId: "open", total: 100 }, { productId: "event", total: 80 }, { productId: "pre", total: 30 }] }];
  const products = [{ id: "member", name: "สมัคร สมาชิก" }, { id: "open", name: "ขายได้ทุกอย่าง" }, { id: "event", category: "Event" }, { id: "pre", category: "Pre order" }];
  const payments = [{ status: "verified", date: "2026-11-02", amount: 90, eventType: "gym" }];
  const orders = [{ status: "confirmed", date: "2026-11-02", total: 100 }, { status: "pending_review", date: "2026-11-02", total: 500 }];
  const actual = calculateActuals("2026-11", tx, products, payments, orders);
  const progress = salesProgress("2026-11", "2026-11-02", tx, products, payments, orders);
  assert.equal(actual.revenue.bangkae, 150); assert.equal(actual.revenue.online, 100);
  assert.equal(progress.product, 250); assert.equal(progress.event, 170);
  assert.equal(pace(progress.product, 200, 2, 30).percent, 125);
  assert.equal(incentivePool(250, { revenueTarget: 200, eventTargets: { pokemon: 0, lorcana: 0, riftbound: 0, monsnatch: 0 }, budgetTarget: 0, poolRevenuePct: 10, poolPerGame: 0, passWeeks: 1 }, { pokemon: 0, lorcana: 0, riftbound: 0, monsnatch: 0 }), 5);
});
