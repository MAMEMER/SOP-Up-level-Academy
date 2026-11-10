import test from "node:test";
import assert from "node:assert/strict";
import { billExclusion, countedTotal, excludedKind, kindByProductId } from "../lib/flower-exclusions.ts";

test("event and preorder products are excluded, board game service is not", () => {
  assert.equal(excludedKind({ category: "Event", name: "Pokemon Event" }), "event");
  assert.equal(excludedKind({ category: "Lorcana", name: "Pre-Release Lorcana(Set14)" }), "event");
  assert.equal(excludedKind({ category: "Lorcana", name: "Pre release Lorcana" }), "event");
  assert.equal(excludedKind({ category: "Pre order", name: "พรีออเดอร์" }), "preorder");
  assert.equal(excludedKind({ category: "Pre order", name: "Pre Odrer Lorcana  SET 14" }), "preorder");
  assert.equal(excludedKind({ category: "Event", name: "ค่าบริการบอร์ดเกม" }), null);
  assert.equal(excludedKind({ category: "Lorcana S1", name: "Lorcana S1 - Be Prepared" }), null);
  assert.equal(excludedKind({ category: "Box", name: "BOX 1700฿" }), null);
  assert.equal(excludedKind(undefined), null);
});

test("billExclusion sums only excluded lines", () => {
  const kinds = kindByProductId([
    { id: "ev", category: "Event", name: "Lorcana Event" },
    { id: "pre", category: "Pre order", name: "พรีออเดอร์" },
    { id: "box", category: "Box", name: "Box" }
  ]);
  const result = billExclusion([
    { productId: "ev", total: 250 },
    { productId: "pre", total: 1350 },
    { productId: "box", total: 1700 },
    { productId: "unknown", total: 99 }
  ], kinds);
  assert.deepEqual(result, { excludedEvent: 250, excludedPreorder: 1350 });
  assert.deepEqual(billExclusion(undefined, kinds), { excludedEvent: 0, excludedPreorder: 0 });
});

test("countedTotal subtracts exclusions and never goes negative", () => {
  assert.equal(countedTotal({ total: 3300, excludedEvent: 250, excludedPreorder: 1350 }), 1700);
  assert.equal(countedTotal({ total: 500 }), 500);
  assert.equal(countedTotal({ total: 100, excludedPreorder: 120 }), 0);
});
