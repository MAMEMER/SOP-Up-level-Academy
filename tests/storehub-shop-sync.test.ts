import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildImageIndexes,
  buildMergePayload,
  buildShopRow,
  classify,
  computeStorePrice,
  matchImage,
  normK,
  parseSingle,
  stockChanged,
  type LorcanaCard,
  type PkmCard,
  type StoreHubProduct,
} from "../lib/storehub-shop-sync.ts";

describe("classify", () => {
  it("maps Lorcana single sets to single/lorcana", () => {
    assert.deepEqual(classify({ name: "Lorcana S1 - Abu - Mischievous Monkey", category: "Lorcana S1" }), {
      type: "single",
      game: "lorcana",
    });
  });

  it("maps a Pokémon set category to single/pokemon", () => {
    assert.deepEqual(classify({ name: "Pikachu (U · SV10s T 130/138)", category: "sv10s" }), {
      type: "single",
      game: "pokemon",
    });
  });

  it("flags sealed products by keyword", () => {
    assert.equal(classify({ name: "Pokémon ดรีม Booster Box", category: "misc" }).type, "sealed");
    assert.equal(classify({ name: "Pokémon ดรีม Booster Box", category: "misc" }).game, "pokemon");
    assert.equal(classify({ name: "ETB Elite Trainer Box", category: "" }).type, "sealed");
  });

  it("flags accessories by keyword", () => {
    assert.equal(classify({ name: "Dragon Shield Sleeve มาตรฐาน", category: "" }).type, "accessory");
    assert.equal(classify({ name: "Playmat ลาย Elsa", category: "" }).type, "accessory");
  });

  it("treats a bare card-category product as sealed", () => {
    assert.equal(classify({ name: "Mystery product", category: "card" }).type, "sealed");
  });

  it("defaults to other when nothing matches", () => {
    assert.deepEqual(classify({ name: "น้ำเปล่า", category: "drinks" }), { type: "other", game: "" });
  });
});

describe("parseSingle", () => {
  it("takes the text after the first dash as the card name", () => {
    assert.equal(parseSingle("Lorcana S1 - Abu - Mischievous Monkey").cardName, "Abu - Mischievous Monkey");
  });
  it("returns the whole name when there is no dash", () => {
    assert.equal(parseSingle("Booster Box").cardName, "Booster Box");
  });
});

describe("computeStorePrice", () => {
  it("adds 7% VAT and rounds", () => {
    assert.equal(computeStorePrice(100), 107);
    assert.equal(computeStorePrice(149), 159); // 149*1.07 = 159.43 → 159
    assert.equal(computeStorePrice(150), 161); // 150*1.07 = 160.5 → 161
  });
  it("returns null for zero or missing unit price", () => {
    assert.equal(computeStorePrice(0), null);
    assert.equal(computeStorePrice(undefined), null);
    assert.equal(computeStorePrice(null), null);
  });
});

describe("normK", () => {
  it("lowercases and strips punctuation and dashes", () => {
    assert.equal(normK("Rosy-Cheeked"), "rosycheeked");
    assert.equal(normK("Abu!, (Test)"), "abutest");
    assert.equal(normK(undefined), "");
  });
});

describe("image join", () => {
  const lorcana: LorcanaCard[] = [
    { setCode: "1", name: "Abu", version: "Mischievous Monkey", image: "https://img/abu.png" },
    { setCode: "1", name: "Friends on the Other Side", version: "", image: "https://img/song.png" },
  ];
  const pkm: PkmCard[] = [
    { expansionCode: "SV10s", collectorNumber: "130/138", image: "https://img/pika.png" },
    { expansionCode: "MA4", collectorNumber: "062/123", image: "https://img/ma4.png" },
  ];
  const idx = buildImageIndexes(lorcana, pkm);

  it("matches a Lorcana single by set|name|version", () => {
    assert.equal(
      matchImage({ name: "Lorcana S1 - Abu - Mischievous Monkey", category: "Lorcana S1" }, "lorcana", idx),
      "https://img/abu.png"
    );
  });

  it("matches a single-segment Lorcana song by set + name, any version", () => {
    assert.equal(
      matchImage({ name: "Lorcana S1 - Friends on the Other Side", category: "Lorcana S1" }, "lorcana", idx),
      "https://img/song.png"
    );
  });

  it("matches a Pokémon single by expansion code + collector number (with T separator)", () => {
    assert.equal(
      matchImage({ name: "Pikachu (U · SV10s T 130/138)", category: "sv10s" }, "pokemon", idx),
      "https://img/pika.png"
    );
  });

  it("matches a Pokémon single without the T separator and strips leading zeros", () => {
    assert.equal(
      matchImage({ name: "Charizard (MA4 062/123)", category: "sv10s" }, "pokemon", idx),
      "https://img/ma4.png"
    );
  });

  it("returns null when no catalog entry matches", () => {
    assert.equal(matchImage({ name: "Unknown (ZZ 999/999)", category: "sv10s" }, "pokemon", idx), null);
    assert.equal(matchImage({ name: "Lorcana S1 - Nobody - Ghost", category: "Lorcana S1" }, "lorcana", idx), null);
  });

  it("skips catalog cards without an image", () => {
    const built = buildImageIndexes([{ setCode: "1", name: "NoImg", version: "X" }], []);
    assert.equal(built.lorIdx.size, 0);
  });
});

describe("buildShopRow", () => {
  const idx = buildImageIndexes(
    [{ setCode: "1", name: "Abu", version: "Mischievous Monkey", image: "https://img/abu.png" }],
    []
  );
  const single: StoreHubProduct = {
    id: "p1",
    name: "Lorcana S1 - Abu - Mischievous Monkey",
    category: "Lorcana S1",
    unitPrice: 100,
    sku: "SKU1",
    trackStockLevel: true,
  };

  it("builds a single row with VAT price and joined image", () => {
    const row = buildShopRow(single, 5, null, idx);
    assert.equal(row.type, "single");
    assert.equal(row.game, "lorcana");
    assert.equal(row.storePrice, 107);
    assert.equal(row.price, 107);
    assert.equal(row.priceOverride, null);
    assert.equal(row.image, "https://img/abu.png");
    assert.equal(row.cardName, "Abu - Mischievous Monkey");
    assert.equal(row.qty, 5);
    assert.equal(row.trackStock, true);
  });

  it("lets an admin priceOverride win over the auto VAT price", () => {
    const row = buildShopRow(single, 5, 250, idx);
    assert.equal(row.storePrice, 107); // auto suggestion still computed
    assert.equal(row.priceOverride, 250);
    assert.equal(row.price, 250); // override wins
  });

  it("never joins an image for non-single types", () => {
    const sealed: StoreHubProduct = { id: "p2", name: "Booster Box", category: "card", unitPrice: 0 };
    const row = buildShopRow(sealed, 2, null, idx);
    assert.equal(row.type, "sealed");
    assert.equal(row.image, null);
    assert.equal(row.storePrice, null);
    assert.equal(row.price, null);
  });
});

describe("buildMergePayload — admin-owned fields are never written by the cron", () => {
  const idx = buildImageIndexes([], []);
  it("omits price and priceOverride so a hand-set price is never clobbered", () => {
    const row = buildShopRow({ id: "p1", name: "X", category: "card", unitPrice: 100 }, 3, 999, idx);
    const payload = buildMergePayload(row);
    assert.equal("price" in payload, false);
    assert.equal("priceOverride" in payload, false);
    // but stock + auto suggestion + metadata ARE written
    assert.equal(payload.qty, 3);
    assert.equal(payload.storePrice, 107);
    assert.equal(payload.id, "p1");
  });
});

describe("stockChanged", () => {
  it("is true when the previous quantity is unknown (new product)", () => {
    assert.equal(stockChanged(undefined, 4), true);
  });
  it("is true when the quantity differs", () => {
    assert.equal(stockChanged(4, 5), true);
  });
  it("is false when the quantity is unchanged", () => {
    assert.equal(stockChanged(4, 4), false);
  });
});
