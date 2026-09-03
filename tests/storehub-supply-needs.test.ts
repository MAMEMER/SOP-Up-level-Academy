import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSupplyNeeds,
  filterNearEmpty,
  parseSupplyNeeds,
  summariseSupplyNeeds,
  type SupplyNeedItem
} from "../lib/storehub-supply-needs.ts";

describe("parseSupplyNeeds", () => {
  it("reads a JSON array with standard field names", () => {
    const items = parseSupplyNeeds([
      { productName: "Sleeve มาตรฐาน", stockOnHand: 3, reorderPoint: 10 },
      { productName: "Deck box", quantityOnHand: 20, reorderPoint: 5 }
    ]);
    assert.equal(items.length, 2);
    assert.deepEqual(items[0], { name: "Sleeve มาตรฐาน", remaining: 3, reorderPoint: 10 });
    assert.equal(items[1].remaining, 20);
  });

  it("unwraps a wrapped object payload ({ supplyNeeds: [...] })", () => {
    const items = parseSupplyNeeds({ supplyNeeds: [{ name: "น้ำเปล่า", qty: 2 }] });
    assert.equal(items.length, 1);
    assert.equal(items[0].name, "น้ำเปล่า");
    assert.equal(items[0].remaining, 2);
  });

  it("parses CSV text with Thai/English headers", () => {
    const csv = ["ชื่อสินค้า,คงเหลือ,จุดสั่งซื้อ", "Booster Box,1,3", '"ขนม, รวม",8,4'].join("\n");
    const items = parseSupplyNeeds(csv);
    assert.equal(items.length, 2);
    assert.equal(items[0].name, "Booster Box");
    assert.equal(items[0].remaining, 1);
    assert.equal(items[0].reorderPoint, 3);
    // quoted field containing a comma stays one product name
    assert.equal(items[1].name, "ขนม, รวม");
  });

  it("parses a JSON string body", () => {
    const items = parseSupplyNeeds('[{"name":"Toploader","remaining":"4"}]');
    assert.equal(items.length, 1);
    assert.equal(items[0].remaining, 4);
  });

  it("strips thousands separators from numeric strings", () => {
    const items = parseSupplyNeeds([{ name: "ถุงพลาสติก", remaining: "1,250" }]);
    assert.equal(items[0].remaining, 1250);
  });

  it("skips rows with no name or no quantity", () => {
    const items = parseSupplyNeeds([{ remaining: 5 }, { name: "ไม่มีจำนวน" }, { name: "โอเค", remaining: 0 }]);
    assert.equal(items.length, 1);
    assert.equal(items[0].name, "โอเค");
  });
});

describe("filterNearEmpty", () => {
  const items: SupplyNeedItem[] = [
    { name: "A", remaining: 2, reorderPoint: 5 },
    { name: "B", remaining: 12, reorderPoint: 5 },
    { name: "C", remaining: 0, reorderPoint: 3 },
    { name: "D", remaining: 4 } // no reorderPoint → default threshold 5
  ];

  it("keeps only items at or below their reorder point (or default threshold)", () => {
    const near = filterNearEmpty(items);
    assert.deepEqual(near.map((item) => item.name), ["C", "A", "D"]);
  });

  it("sorts most-empty first", () => {
    const near = filterNearEmpty(items);
    assert.equal(near[0].name, "C");
    assert.equal(near[0].remaining, 0);
  });

  it("respects a custom threshold", () => {
    const near = filterNearEmpty([{ name: "X", remaining: 9 }], 10);
    assert.equal(near.length, 1);
  });
});

describe("summariseSupplyNeeds", () => {
  it("formats one line per item as 'name | qty'", () => {
    const text = summariseSupplyNeeds([
      { name: "Sleeve", remaining: 3 },
      { name: "น้ำ", remaining: 2, unit: "ขวด" }
    ]);
    assert.equal(text, "Sleeve | 3\nน้ำ | 2 ขวด");
  });
});

describe("buildSupplyNeeds (StoreHub Open API)", () => {
  const products = [
    { id: "p1", name: "ทีพลัส ชาอูหลง (490 ml)", category: "Drink", cost: 25 },
    { id: "p2", name: "Oreo", category: "Snack", cost: 10 },
    { id: "p3", name: "ทิวลี่", category: "Snack", cost: 4 },
    { id: "p4", name: "การ์ดใบเดี่ยว", category: "Lorcana S1", cost: 0, unitPrice: 0 },
    { id: "p5", name: "Up shield", category: "อุปกรณ์" },
    { id: "p6", name: "เลย์คลาสสิค", category: "Snack", unitPrice: 20 }
  ];

  it("keeps only products with a reorder point, and only those at or below it", () => {
    const { needs, trackedCount } = buildSupplyNeeds(
      [
        { productId: "p1", quantityOnHand: 0, warningStock: 3, idealStock: 6 },
        { productId: "p2", quantityOnHand: 2, warningStock: 6, idealStock: 12 },
        { productId: "p3", quantityOnHand: 31, warningStock: 24, idealStock: 36 }, // above reorder point
        { productId: "p4", quantityOnHand: 1 } // single card, no reorder point → ignored
      ],
      products
    );
    assert.deepEqual(
      needs.map((item) => item.name),
      ["ทีพลัส ชาอูหลง (490 ml)", "Oreo"]
    );
    assert.equal(trackedCount, 3);
  });

  it("computes order quantity and value from idealStock and cost", () => {
    const { needs, estimatedTotal } = buildSupplyNeeds(
      [
        { productId: "p1", quantityOnHand: 0, warningStock: 3, idealStock: 6 },
        { productId: "p2", quantityOnHand: 2, warningStock: 6, idealStock: 12 }
      ],
      products
    );
    assert.equal(needs[0].orderQty, 6);
    assert.equal(needs[0].estimatedCost, 150);
    assert.equal(needs[0].costSource, "cost");
    assert.equal(needs[1].orderQty, 10);
    assert.equal(needs[1].estimatedCost, 100);
    assert.equal(estimatedTotal, 250);
  });

  it("falls back to the pre-VAT selling price when no cost is set, and flags items with neither", () => {
    const { needs, missingCostCount } = buildSupplyNeeds(
      [
        { productId: "p6", quantityOnHand: 1, warningStock: 3, idealStock: 6 },
        { productId: "p5", quantityOnHand: 60, warningStock: 800, idealStock: 2000 }
      ],
      products
    );
    const lays = needs.find((item) => item.name === "เลย์คลาสสิค");
    assert.equal(lays?.costSource, "price");
    assert.equal(lays?.estimatedCost, 100);
    const shield = needs.find((item) => item.name === "Up shield");
    assert.equal(shield?.costSource, "none");
    assert.equal(shield?.estimatedCost, undefined);
    assert.equal(missingCostCount, 1);
  });

  it("sorts the emptiest shelf first and lists near-empty items separately", () => {
    const { needs, watch } = buildSupplyNeeds(
      [
        { productId: "p2", quantityOnHand: 2, warningStock: 6, idealStock: 12 }, // ratio 0.33
        { productId: "p1", quantityOnHand: 0, warningStock: 3, idealStock: 6 }, // ratio 0
        { productId: "p3", quantityOnHand: 31, warningStock: 24, idealStock: 36 } // ratio 1.29 → watch
      ],
      products
    );
    assert.deepEqual(
      needs.map((item) => item.name),
      ["ทีพลัส ชาอูหลง (490 ml)", "Oreo"]
    );
    assert.deepEqual(
      watch.map((item) => item.name),
      ["ทิวลี่"]
    );
  });
});
