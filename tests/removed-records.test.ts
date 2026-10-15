import test from "node:test";
import assert from "node:assert/strict";
import { visibleRecords, isRemoved, removalFields } from "../lib/removed-records.ts";
import { fromShop, orderCounts } from "../lib/customer-orders.ts";

test("only boolean true is removed; missing fields and restored docs remain visible", () => {
  const rows = [{ id: "old" }, { id: "restored", removed: false }, { id: "removed", removed: true }, { id: "string", removed: "true" }, { id: "null", removed: null }];
  assert.deepEqual(visibleRecords(rows).map((r) => r.id), ["old", "restored", "string", "null"]);
  assert.equal(isRemoved({ removed: 1 }), false);
  assert.equal(rows.length, 5);
});
test("show removed starts off, on includes audit rows, off hides them again without changing input", () => {
  const audit = { removed: true, removedBy: "UP-001", removedAt: "2026-10-15T08:00:00Z", removedReason: "รายการซ้ำ" };
  const active = fromShop({ id: "active", status: "confirmed" })!;
  const removed = { ...active, key: "shop__removed", ...audit };
  const rows = [active, removed];
  assert.deepEqual(visibleRecords(rows), [active]);
  assert.deepEqual(visibleRecords(rows, true), rows);
  assert.deepEqual(visibleRecords(rows, false), [active]);
  assert.deepEqual(removalFields(removed), audit);
  assert.deepEqual(removalFields({ removed: false, removedBy: "old" }), {});
  assert.equal(orderCounts(visibleRecords(rows, true)).all, 1);
  assert.equal(orderCounts(visibleRecords(rows, true)).todo, orderCounts([active]).todo);
});
