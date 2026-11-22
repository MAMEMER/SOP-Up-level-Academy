import { test } from "node:test";
import { strict as assert } from "node:assert";
import { gameFor, monthWeeks, weekKey, passedWeeks, incentivePool, splitPool, splitEligiblePool, group4Score, type TeamTargets } from "../lib/team-targets.ts";

test("maps event names and Bangkok calendar weeks", () => {
  assert.equal(gameFor("Pokémon Pre release"), "pokemon");
  assert.equal(gameFor("tactic-deck"), "pokemon");
  assert.equal(gameFor("Rift Bound skirmish"), "riftbound");
  assert.equal(gameFor("other"), "other");
  assert.equal(weekKey("2026-11-01"), "2026-10-26");
  assert.equal(monthWeeks("2026-11").length, 6);
});

test("splits equally only among qualifying staff", () => {
  const result = splitEligiblePool(300, [{ code: "A", total: 90, incentiveEligible: true, availableDays: 30 }, { code: "B", total: 99, incentiveEligible: true, availableDays: 30 }, { code: "C", total: 89.9, incentiveEligible: true, availableDays: 30 }, { code: "D", total: 100, incentiveEligible: false, availableDays: 30 }], 30);
  assert.deepEqual(result.shares.map(s => s.amount), [150, 150]);
  assert.equal(result.carriedOver, 0);
});

test("prorates partial months and redistributes remainder to full-month staff", () => {
  const result = splitEligiblePool(300, [{ code: "A", total: 90, incentiveEligible: true, availableDays: 30 }, { code: "B", total: 90, incentiveEligible: true, availableDays: 30 }, { code: "C", total: 90, incentiveEligible: true, availableDays: 15 }], 30);
  assert.deepEqual(result.shares.map(s => s.amount), [125, 125, 50]);
});

test("carries the whole pool when no staff qualify and preserves partial remainder", () => {
  assert.equal(splitEligiblePool(300, [], 30).carriedOver, 300);
  const partial = splitEligiblePool(300, [{ code: "A", total: 90, incentiveEligible: true, availableDays: 15 }], 30);
  assert.equal(partial.shares[0].amount, 150);
  assert.equal(partial.carriedOver, 150);
});
test("passes configured targets, computes pool and distributes by hours", () => {
  const targets: TeamTargets = { revenueTarget: 200000, eventTargets: { pokemon: 2, lorcana: 0, riftbound: 1, monsnatch: 2 }, budgetTarget: 100, poolRevenuePct: 10, poolPerGame: 1000, passWeeks: 1 };
  const passed = passedWeeks(["a", "b"], { a: { pokemon: 2, riftbound: 1 } }, targets.eventTargets);
  assert.deepEqual(passed, { pokemon: 1, lorcana: 0, riftbound: 1, monsnatch: 0 });
  assert.equal(incentivePool(250000, targets, passed), 7000);
  assert.equal(incentivePool(200001, targets, passed), 2000.1);
  assert.equal(incentivePool(190000, targets, passed), 2000);
  assert.equal(incentivePool(250000, { ...targets, poolRevenuePct: 5 }, passed), 4500);
  const shares = splitEligiblePool(incentivePool(250000, targets, passed), [{ code: "A", total: 90, incentiveEligible: true, availableDays: 30 }, { code: "B", total: 90, incentiveEligible: true, availableDays: 30 }], 30);
  assert.deepEqual(shares.shares.map(s => s.amount), [3500, 3500]);
  assert.deepEqual(splitPool(30, [{ code: "A", hours: 1 }, { code: "B", hours: 2 }]).map(x => x.amount), [10, 20]);
  assert.equal(group4Score(100, 100, 1, 2, 100, 120), (100 + 50 + 80) / 3);
});

test("counts sales, excludes preorders and cancelled bills, and adds verified online entries", async () => {
  const { calculateActuals } = await import("../lib/team-targets.ts");
  const tx = { storeId: "6a268170c008ab000760e21a", transactionTime: "2026-11-01T17:30:00Z", total: 120, items: [{ productId: "pre", total: 20 }, { productId: "event", quantity: 2, total: 30 }] };
  const actual = calculateActuals("2026-11", [tx, { ...tx, isCancelled: true }], [{ id: "pre", category: "Pre order" }, { id: "event", name: "Pokémon Gym", category: "Event" }], [{ status: "verified", date: "2026-11-02", amount: 10, source: "gym" }]);
  assert.equal(actual.revenue.bangkae, 70);
  assert.equal(actual.revenue.online, 0);
  assert.equal(actual.entries["2026-11-02"].pokemon, 3);
});

test("rejects incomplete POS data instead of reporting understated revenue", async () => {
  const { calculateActuals } = await import("../lib/team-targets.ts");
  const tx = { storeId: "6a268170c008ab000760e21a", transactionTime: "2026-11-02T00:00:00Z", total: 1, items: [{ productId: "missing", total: 1 }] };
  assert.throws(() => calculateActuals("2026-11", [tx], [], []));
});
