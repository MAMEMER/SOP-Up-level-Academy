import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  averageStock,
  bangkokDate,
  buildSnapshotDocs,
  compactInventory,
  lastSaleOrReceiptAge,
  mergeSnapshotParts,
  onHandBefore,
  snapshotDaysInMonth,
  stockoutDays,
  type DaySnapshot
} from "../lib/inventory-snapshots.ts";

// dummy ids/quantities only — no real catalogue data in this public repo

describe("inventory snapshots", () => {
  it("uses the Bangkok date (23:55 BKK = 16:55 UTC is still the same day)", () => {
    assert.equal(bangkokDate(Date.parse("2026-10-27T16:55:00Z")), "2026-10-27");
    assert.equal(bangkokDate(Date.parse("2026-10-27T17:05:00Z")), "2026-10-28");
  });

  it("compacts rows to productId → qty, keeping zero/negative", () => {
    assert.deepEqual(
      compactInventory([{ productId: "p1", quantityOnHand: 3 }, { productId: "p2", quantityOnHand: 0 }, { productId: "p3", quantityOnHand: -1 }, { quantityOnHand: 9 }]),
      { p1: 3, p2: 0, p3: -1 }
    );
  });

  it("writes one doc normally and splits into parts that merge back", () => {
    const items = Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`prod${i}`, i % 7]));
    const single = buildSnapshotDocs({ branch: "b1", storeId: "s1", date: "2026-10-01", takenAt: 1, items });
    assert.equal(single.length, 1);
    assert.equal(single[0].id, "b1__2026-10-01");
    const split = buildSnapshotDocs({ branch: "b1", storeId: "s1", date: "2026-10-01", takenAt: 1, items, maxBytes: 8000 });
    assert.ok(split.length > 1);
    assert.equal(split[1].id, "b1__2026-10-01__part2");
    assert.ok(split.every((d) => d.data.parts === split.length && d.data.count === 1000));
    const merged = mergeSnapshotParts(split.map((d) => d.data));
    assert.deepEqual(merged.get("b1")?.[0].items, items);
    // a missing part = incomplete day, dropped instead of under-counting
    assert.equal(mergeSnapshotParts(split.slice(1).map((d) => d.data)).get("b1"), undefined);
  });

  const series: DaySnapshot[] = [
    { date: "2026-09-30", items: { a: 0, b: 5 } },
    { date: "2026-10-01", items: { a: 2, b: 0 } },
    { date: "2026-10-02", items: { a: 0, b: -1 } },
    { date: "2026-10-03", items: { a: 4 } }
  ];

  it("counts stockout days within the month only (missing = 0, negative = out)", () => {
    assert.deepEqual(stockoutDays(series, ["a", "b"], "2026-10"), { a: 1, b: 3 });
    assert.equal(snapshotDaysInMonth(series, "2026-10"), 3);
  });

  it("averages stock with oversold clamped to 0", () => {
    assert.deepEqual(averageStock(series.slice(1), ["a", "b"]), { a: 2, b: 0 });
    assert.deepEqual(averageStock([]), {});
  });

  it("stock age = days since the later of last sale / last receipt", () => {
    assert.equal(lastSaleOrReceiptAge({ lastSaleDate: "2026-10-01", lastReceiptDate: "2026-10-10", today: "2026-10-27" }), 17);
    assert.equal(lastSaleOrReceiptAge({ lastSaleDate: "2026-10-20", today: "2026-10-27" }), 7);
    assert.equal(lastSaleOrReceiptAge({ today: "2026-10-27" }), null);
  });

  it("on-hand before a date uses the latest earlier snapshot", () => {
    assert.equal(onHandBefore(series, "a", "2026-10-02"), 2);
    assert.equal(onHandBefore(series, "b", "2026-10-03"), -1);
    assert.equal(onHandBefore(series, "a", "2026-09-01"), null);
  });
});
