import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_REORDER_THRESHOLD_THB,
  buildReorderDetail,
  buildReorderTitle,
  parseMoney,
  parseSupplyNeedsCsv,
  summariseReorder
} from "../lib/supply-needs-reorder.ts";

describe("parseMoney", () => {
  it("strips currency symbols, commas and spaces", () => {
    assert.equal(parseMoney("฿1,234.50"), 1234.5);
    assert.equal(parseMoney(" 2,000 "), 2000);
    assert.equal(parseMoney("540"), 540);
  });

  it("treats blanks / dashes / junk as 0", () => {
    assert.equal(parseMoney(""), 0);
    assert.equal(parseMoney("-"), 0);
    assert.equal(parseMoney("N/A"), 0);
  });
});

describe("parseSupplyNeedsCsv", () => {
  it("parses a StoreHub-style CSV with English headers", () => {
    const csv = [
      "Product,Supplier,Order Qty,Cost",
      "Booster Box A,Pokemon,3,540",
      "Sleeve B,Dragon Shield,10,650"
    ].join("\n");
    const rows = parseSupplyNeedsCsv(csv);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], { productName: "Booster Box A", supplier: "Pokemon", orderQuantity: 3, lineCost: 540 });
    assert.equal(rows[1].lineCost, 650);
  });

  it("parses tab-separated paste (copied straight from the table)", () => {
    const tsv = ["Product\tSupplier\tCost", "Card X\tKonami\t1200"].join("\n");
    const rows = parseSupplyNeedsCsv(tsv);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].lineCost, 1200);
  });

  it("matches Thai headers and prefers a total-cost column", () => {
    const csv = ["ชื่อสินค้า,ผู้ขาย,จำนวนที่สั่ง,ต้นทุนรวม", "การ์ด ก,ผู้ขาย ก,2,900"].join("\n");
    const rows = parseSupplyNeedsCsv(csv);
    assert.equal(rows[0].productName, "การ์ด ก");
    assert.equal(rows[0].orderQuantity, 2);
    assert.equal(rows[0].lineCost, 900);
  });

  it("drops blank and total rows", () => {
    const csv = ["Product,Cost", "Item A,500", ",", "Total,500"].join("\n");
    const rows = parseSupplyNeedsCsv(csv);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].productName, "Item A");
  });

  it("returns [] for empty or header-only input", () => {
    assert.deepEqual(parseSupplyNeedsCsv(""), []);
    assert.deepEqual(parseSupplyNeedsCsv("Product,Cost"), []);
  });
});

describe("summariseReorder", () => {
  it("sums cost and fires at the ฿1,000 threshold (inclusive)", () => {
    const rows = parseSupplyNeedsCsv(["Product,Cost", "A,600", "B,400"].join("\n"));
    const summary = summariseReorder(rows);
    assert.equal(summary.totalCost, 1000);
    assert.equal(summary.itemCount, 2);
    assert.equal(summary.threshold, DEFAULT_REORDER_THRESHOLD_THB);
    assert.equal(summary.reached, true);
  });

  it("does not fire below the threshold", () => {
    const rows = parseSupplyNeedsCsv(["Product,Cost", "A,999"].join("\n"));
    assert.equal(summariseReorder(rows).reached, false);
  });

  it("honours a custom threshold", () => {
    const rows = parseSupplyNeedsCsv(["Product,Cost", "A,600"].join("\n"));
    assert.equal(summariseReorder(rows, 500).reached, true);
    assert.equal(summariseReorder(rows, 700).reached, false);
  });

  it("rounds floating cost sums to 2 dp", () => {
    const rows = parseSupplyNeedsCsv(["Product,Cost", "A,0.1", "B,0.2"].join("\n"));
    assert.equal(summariseReorder(rows).totalCost, 0.3);
  });
});

describe("assignment text", () => {
  it("puts the total in the title", () => {
    const summary = summariseReorder(parseSupplyNeedsCsv(["Product,Cost", "A,1500"].join("\n")));
    assert.match(buildReorderTitle(summary), /1,500/);
    assert.match(buildReorderTitle(summary), /🛒/u);
  });

  it("lists each item in the detail body and references StoreHub", () => {
    const summary = summariseReorder(
      parseSupplyNeedsCsv(["Product,Supplier,Order Qty,Cost", "Booster A,Pokemon,3,540", "Sleeve B,DS,10,650"].join("\n"))
    );
    const detail = buildReorderDetail(summary);
    assert.match(detail, /Booster A/);
    assert.match(detail, /Sleeve B/);
    assert.match(detail, /Supply Needs/);
  });

  it("caps the printed list and notes the overflow", () => {
    const lines = ["Product,Cost"];
    for (let i = 0; i < 80; i += 1) lines.push(`Item ${i},100`);
    const summary = summariseReorder(parseSupplyNeedsCsv(lines.join("\n")));
    const detail = buildReorderDetail(summary, 60);
    assert.match(detail, /และอีก 20 รายการ/);
  });
});
