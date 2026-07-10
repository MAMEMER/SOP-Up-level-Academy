import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapStoreHubStockItems,
  splitStoreHubStockForDashboard,
  stockStatusFromQuantity
} from "../lib/storehub-stock.ts";

describe("StoreHub stock mapping", () => {
  it("maps flexible StoreHub product fields into dashboard stock items", () => {
    const items = mapStoreHubStockItems([
      {
        id: "p-1",
        productName: "Pokemon Booster Box",
        categoryName: "Booster",
        stockOnHand: 3,
        reorderPoint: 5,
        sellingPrice: 4500,
        updatedAt: "2026-07-05T09:00:00+07:00"
      },
      {
        productId: "p-2",
        name: "One Piece OP-09 Pack",
        category: "Booster",
        quantity: 0,
        price: 160,
        lastUpdated: "2026-07-05T10:00:00+07:00"
      }
    ]);

    assert.equal(items.length, 2);
    assert.deepEqual(items.map((item) => item.status), ["low", "out"]);
    assert.equal(items[0].name, "Pokemon Booster Box");
    assert.equal(items[0].remaining, 3);
    assert.equal(items[0].estimatedValue, 13500);
    assert.equal(items[1].id, "storehub-p-2");
  });

  it("classifies stock quantity against reorder point", () => {
    assert.equal(stockStatusFromQuantity(0, 5), "out");
    assert.equal(stockStatusFromQuantity(3, 5), "low");
    assert.equal(stockStatusFromQuantity(6, 5), "normal");
  });

  it("splits high-value cards from normal stock", () => {
    const result = splitStoreHubStockForDashboard([
      {
        id: "card-1",
        productName: "Charizard SAR PSA 10",
        categoryName: "Single Card",
        stockOnHand: 1,
        sellingPrice: 42000,
        updatedAt: "2026-07-05T09:00:00+07:00"
      },
      {
        id: "sleeve-1",
        productName: "Premium Sleeve",
        categoryName: "Accessory",
        stockOnHand: 12,
        sellingPrice: 300,
        updatedAt: "2026-07-05T09:00:00+07:00"
      }
    ]);

    assert.equal(result.stockItems.length, 1);
    assert.equal(result.highValueCards.length, 1);
    assert.equal(result.highValueCards[0].name, "Charizard SAR PSA 10");
    assert.equal(result.highValueCards[0].estimatedValue, 42000);
  });
});
