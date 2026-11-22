import { test } from "node:test";
import { strict as assert } from "node:assert";
import { gameFor, monthWeeks, weekKey, passedWeeks, incentivePool, splitPool, group4Score, type TeamTargets } from "../lib/team-targets.ts";

test("maps event names and Bangkok calendar weeks", () => {
  assert.equal(gameFor("Pokémon Pre release"), "pokemon");
  assert.equal(gameFor("tactic-deck"), "pokemon");
  assert.equal(gameFor("Rift Bound skirmish"), "riftbound");
  assert.equal(gameFor("other"), "other");
  assert.equal(weekKey("2026-11-01"), "2026-10-26");
  assert.equal(monthWeeks("2026-11").length, 6);
});
test("passes configured targets, computes pool and distributes by hours", () => {
  const targets: TeamTargets = { revenueTarget: 1, eventTargets: { pokemon: 2, lorcana: 0, riftbound: 1, monsnatch: 2 }, budgetTarget: 100, poolPer10k: 10, poolPerGame: 5, passWeeks: 1 };
  const passed = passedWeeks(["a", "b"], { a: { pokemon: 2, riftbound: 1 } }, targets.eventTargets);
  assert.deepEqual(passed, { pokemon: 1, lorcana: 0, riftbound: 1, monsnatch: 0 });
  assert.equal(incentivePool(20002, targets, passed), 30);
  assert.deepEqual(splitPool(30, [{ code: "A", hours: 1 }, { code: "B", hours: 2 }]).map(x => x.amount), [10, 20]);
  assert.equal(group4Score(100, 100, 1, 2, 100, 120), (100 + 50 + 80) / 3);
});

test("counts sales, excludes preorders and cancelled bills, and adds verified online entries", async () => {
  const { calculateActuals } = await import("../lib/team-targets.ts");
  const tx = { storeId: "6a268170c008ab000760e21a", transactionTime: "2026-11-01T17:30:00Z", total: 120, items: [{ productId: "pre", total: 20 }, { productId: "event", quantity: 2 }] };
  const actual = calculateActuals("2026-11", [tx, { ...tx, isCancelled: true }], [{ id: "pre", category: "Pre order" }, { id: "event", name: "Pokémon Gym", category: "Event" }], [{ status: "verified", date: "2026-11-02", amount: 10, source: "gym" }]);
  assert.equal(actual.revenue.bangkae, 100);
  assert.equal(actual.revenue.online, 10);
  assert.equal(actual.entries["2026-11-02"].pokemon, 3);
});

test("rejects incomplete POS data instead of reporting understated revenue", async () => {
  const { calculateActuals } = await import("../lib/team-targets.ts");
  const tx = { storeId: "6a268170c008ab000760e21a", transactionTime: "2026-11-02T00:00:00Z", total: 1, items: [{ productId: "missing", total: 1 }] };
  assert.throws(() => calculateActuals("2026-11", [tx], [], []));
});
