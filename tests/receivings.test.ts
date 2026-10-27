import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  STATUS_CANCELLED,
  STATUS_CONFIRMED,
  STATUS_PENDING,
  applyCostEdits,
  cancelReceiving,
  confirmReceiving,
  movingAverage,
  parseReceivingInput,
  receivingTotal,
  recentDealers,
  redactForViewer,
  searchProducts,
  type ProductCost,
  type Receiving
} from "../lib/receivings.ts";

// Dummy products/costs only — this repo is public.

const base = (over: Partial<Receiving> = {}): Receiving => ({
  id: "r1",
  branch: "bangkae",
  date: "2026-10-10",
  dealer: "Dealer A",
  billNo: "B-1",
  billPhotoUrl: "https://example.test/bill.jpg",
  lines: [{ productId: "p1", sku: "SKU1", name: "Dummy Box", qty: 10, unitCostExVat: 100, owner: "shop" }],
  status: STATUS_PENDING,
  createdBy: "staff",
  createdAt: 1,
  ...over
});

describe("moving average", () => {
  it("weights old cost by on-hand", () => {
    assert.equal(movingAverage(100, 10, 10, 200), 150);
  });
  it("zero or negative on-hand → new unit cost", () => {
    assert.equal(movingAverage(100, 0, 5, 80), 80);
    assert.equal(movingAverage(100, -3, 5, 80), 80);
  });
  it("no previous average → new unit cost", () => {
    assert.equal(movingAverage(null, 7, 5, 80), 80);
  });
});

describe("confirm", () => {
  it("applies once, freezes the on-hand basis, and is idempotent", () => {
    const prev: ProductCost = { productId: "p1", avgCost: 50, onHandBasis: 0, lastReceiptDate: "2026-10-01", lastUnitCost: 50, history: [], updatedAt: 0 };
    const first = confirmReceiving(base(), { p1: prev }, { p1: 10 }, "owner", 5);
    assert.ok("costs" in first);
    assert.equal(first.costs.p1.avgCost, 75);
    assert.equal(first.receiving.status, STATUS_CONFIRMED);
    assert.equal(first.receiving.appliedAt, 5);
    assert.deepEqual(first.receiving.onHandBasis, { p1: 10 });
    const again = confirmReceiving(first.receiving, first.costs, { p1: 999 }, "owner", 6);
    assert.ok("alreadyApplied" in again);
  });
  it("requires a cost on every shop line", () => {
    const r = confirmReceiving(base({ lines: [{ productId: "p1", sku: "", name: "", qty: 1, unitCostExVat: null, owner: "shop" }] }), {}, {}, "o", 1);
    assert.ok("error" in r);
  });
  it("consigned (Champ) lines never touch the cost table", () => {
    const r = confirmReceiving(
      base({ lines: [{ productId: "c1", sku: "", name: "Dummy single", qty: 1, unitCostExVat: null, owner: "champ" }, { productId: "p1", sku: "", name: "", qty: 2, unitCostExVat: 10, owner: "shop" }] }),
      {},
      {},
      "o",
      1
    );
    assert.ok("costs" in r);
    assert.deepEqual(Object.keys(r.costs), ["p1"]);
    assert.equal(receivingTotal(base({ lines: [{ productId: "c1", sku: "", name: "", qty: 3, unitCostExVat: null, owner: "champ" }] })), 0);
  });
  it("two lines of the same product chain correctly", () => {
    const r = confirmReceiving(
      base({ lines: [{ productId: "p1", sku: "", name: "", qty: 10, unitCostExVat: 100, owner: "shop" }, { productId: "p1", sku: "", name: "", qty: 10, unitCostExVat: 200, owner: "shop" }] }),
      {},
      { p1: 0 },
      "o",
      1
    );
    assert.ok("costs" in r);
    assert.equal(r.costs.p1.avgCost, 150);
    assert.equal(r.costs.p1.history.length, 2);
  });
});

describe("cancel + recompute", () => {
  it("rolls back by replaying the remaining confirmed receivings", () => {
    const a = confirmReceiving(base({ id: "a", date: "2026-10-01" }), {}, { p1: 0 }, "o", 1);
    assert.ok("costs" in a);
    const b = confirmReceiving(base({ id: "b", date: "2026-10-05", lines: [{ productId: "p1", sku: "", name: "", qty: 10, unitCostExVat: 300, owner: "shop" }] }), a.costs, { p1: 10 }, "o", 2);
    assert.ok("costs" in b);
    assert.equal(b.costs.p1.avgCost, 200);
    const cancelled = cancelReceiving(b.receiving, [a.receiving, b.receiving], "บิลซ้ำ", "o", 3);
    assert.ok("costs" in cancelled);
    assert.equal(cancelled.receiving.status, STATUS_CANCELLED);
    assert.equal(cancelled.costs.p1?.avgCost, 100);
    const onlyOne = cancelReceiving(a.receiving, [a.receiving], "ผิด", "o", 4);
    assert.ok("costs" in onlyOne);
    assert.equal(onlyOne.costs.p1, null);
  });
  it("needs a reason and can't cancel twice", () => {
    assert.ok("error" in cancelReceiving(base(), [], " ", "o", 1));
    assert.ok("error" in cancelReceiving(base({ status: STATUS_CANCELLED }), [], "x", "o", 1));
  });
});

describe("permissions", () => {
  const input = {
    branch: "bangkae",
    date: "2026-10-10",
    dealer: "Dealer A",
    billPhotoUrl: "https://example.test/b.jpg",
    lines: [{ productId: "p1", qty: 2, unitCostExVat: 55, owner: "shop" }]
  };
  it("non-owner cannot set a cost (dropped server-side)", () => {
    const r = parseReceivingInput(input, { owner: false, branches: ["bangkae"] });
    assert.ok("value" in r);
    assert.equal(r.value.lines[0].unitCostExVat, null);
  });
  it("owner can", () => {
    const r = parseReceivingInput(input, { owner: true, branches: ["bangkae"] });
    assert.ok("value" in r);
    assert.equal(r.value.lines[0].unitCostExVat, 55);
  });
  it("bill photo and real product ids are required", () => {
    assert.ok("error" in parseReceivingInput({ ...input, billPhotoUrl: "" }, { owner: true, branches: ["bangkae"] }));
    assert.ok("error" in parseReceivingInput({ ...input, lines: [{ productId: "a/b", qty: 1 }] }, { owner: true, branches: ["bangkae"] }));
    assert.ok("error" in parseReceivingInput({ ...input, lines: [{ productId: "p", qty: 0 }] }, { owner: true, branches: ["bangkae"] }));
  });
  it("redacts costs and basis for non-owners", () => {
    const r = redactForViewer(base({ onHandBasis: { p1: 3 } }), false);
    assert.equal(r.lines[0].unitCostExVat, null);
    assert.equal(r.onHandBasis, undefined);
    assert.equal(redactForViewer(base(), true).lines[0].unitCostExVat, 100);
  });
  it("cost edits only on pending, consigned stays null", () => {
    const pending = base({ lines: [...base().lines, { productId: "c1", sku: "", name: "", qty: 1, unitCostExVat: null, owner: "champ" }] });
    const r = applyCostEdits(pending, ["120", "99"]);
    assert.ok("receiving" in r);
    assert.equal(r.receiving.lines[0].unitCostExVat, 120);
    assert.equal(r.receiving.lines[1].unitCostExVat, null);
    assert.ok("error" in applyCostEdits(base({ status: STATUS_CONFIRMED }), ["1"]));
  });
});

describe("helpers", () => {
  it("searches name / sku / barcode with exact matches first", () => {
    const products = [
      { id: "1", name: "Dummy Booster Alpha", sku: "AL-1", barcode: "111" },
      { id: "2", name: "Dummy Sleeve", sku: "SL-9", barcode: "222" },
      { id: "3", name: "Alpha Deck", sku: "AL-10", barcode: "333" }
    ];
    assert.deepEqual(searchProducts(products, "al-1").map((p) => p.id), ["1", "3"]);
    assert.deepEqual(searchProducts(products, "222").map((p) => p.id), ["2"]);
    assert.deepEqual(searchProducts(products, "dummy alpha").map((p) => p.id), ["1"]);
    assert.deepEqual(searchProducts(products, ""), []);
  });
  it("lists recent dealers unique, newest first", () => {
    assert.deepEqual(recentDealers([base({ dealer: "A", createdAt: 1 }), base({ dealer: "B", createdAt: 3 }), base({ dealer: "A", createdAt: 2 })]), ["B", "A"]);
  });
});
