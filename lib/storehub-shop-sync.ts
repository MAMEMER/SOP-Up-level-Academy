// Pure mapping logic for the StoreHub → Firestore `shop-products` sync that keeps
// uplevelguild.com/shop stock in step with StoreHub. Ported verbatim from
// scripts/storehub-shop-sync-reference.mjs so the classification, pricing and
// catalog-image join stay byte-for-byte identical to the hand-run reference.
//
// Everything here is side-effect free (no network, no Firestore) so it is unit-tested
// directly. The route (app/api/storehub/sync-shop/route.ts) does the I/O and calls these.

// Up level Academy (บางแค) — the store whose on-hand inventory backs the online shop.
export const MAIN_STORE = "6a268170c008ab000760e21a";
export const STOREHUB_BASE = "https://api.storehubhq.com";

export type ShopProductType = "single" | "sealed" | "accessory" | "other";
export type ShopGame = "lorcana" | "pokemon" | "";

export type StoreHubProduct = {
  id: string;
  name?: string;
  sku?: string | null;
  category?: string;
  unitPrice?: number;
  isParentProduct?: boolean;
  trackStockLevel?: boolean;
};

// --- classification (identical regexes/order to the reference) ---
const LORCANA_RE = /lorcana/i;
const PKM_SET_RE = /(ดรีม|บลาสต์|เงามืด|คุกคาม|พายุ|จักรวาล|ไดsusb|เทอร่า|ดาร์ก|ฟลาริง|พาราไดซ์|อังคาร|ev[0-9]|sv[0-9]|s[0-9]+[a-z]?$)/i;
const SEALED_RE = /\b(box|booster|etb|elite trainer|bundle|display|กล่อง|ซอง|ดิสเพลย์|แพ็ค|pack)\b/i;
const ACC_RE = /\b(sleeve|playmat|deck box|ซอง?การ์ด|แผ่นรอง|กล่องเด็ค|binder|toploader|อัลบั้ม|ปลอก)\b/i;

export function classify(prod: Pick<StoreHubProduct, "name" | "category">): {
  type: ShopProductType;
  game: ShopGame;
} {
  const name = prod.name || "";
  const cat = prod.category || "";
  let type: ShopProductType = "other";
  let game: ShopGame = "";
  if (LORCANA_RE.test(cat) || LORCANA_RE.test(name)) game = "lorcana";

  if (SEALED_RE.test(name) || (cat === "card" && /BOX|booster|กล่อง|ซอง/i.test(name))) {
    type = "sealed";
    if (!game) game = /pok[eé]mon|โปเกมอน|ดรีม|บลาสต์/i.test(name) ? "pokemon" : "";
  } else if (ACC_RE.test(name) || ACC_RE.test(cat)) {
    type = "accessory";
  } else if (/^Lorcana S\d+$/i.test(cat) || PKM_SET_RE.test(cat)) {
    type = "single";
    if (!game) game = LORCANA_RE.test(cat) ? "lorcana" : "pokemon";
  } else if (cat === "card") {
    type = "sealed"; // misc card-category product, treat as sealed unless clearly single
  }
  return { type, game };
}

// parse "Lorcana S1 - Abu - Mischievous Monkey" → cardName for display/search
export function parseSingle(name: string): { cardName: string } {
  const m = name.match(/^(.*?)\s*-\s*(.+)$/);
  return m ? { cardName: m[2].trim() } : { cardName: name };
}

// Price = admin priceOverride (preserved) ?? round(unitPrice*1.07) (VAT). unitPrice 0 → null.
export function computeStorePrice(unitPrice: number | undefined | null): number | null {
  const up = unitPrice || 0;
  return up > 0 ? Math.round(up * 1.07) : null;
}

// --- catalog image join ---
export const normK = (s: string | undefined | null): string =>
  (s || "").toLowerCase().replace(/[\s.,'"!?:()]/g, "").replace(/[\-–—]/g, "").trim();

export type LorcanaCard = { setCode?: string | number; name?: string; version?: string; image?: string };
export type PkmCard = { expansionCode?: string; collectorNumber?: string | number; image?: string };

export type ImageIndexes = {
  lorIdx: Map<string, string>;
  lorByNameVer: Map<string, string>;
  pkmIdx: Map<string, string>;
};

// Build in-memory image indexes from catalog card arrays (lorcana-cards + pkm-cards).
export function buildImageIndexes(lorcana: LorcanaCard[], pkm: PkmCard[]): ImageIndexes {
  const lorIdx = new Map<string, string>();
  const lorByNameVer = new Map<string, string>();
  const pkmIdx = new Map<string, string>();
  for (const v of lorcana) {
    if (!v.image) continue;
    lorIdx.set(`${v.setCode}|${normK(v.name)}|${normK(v.version)}`, v.image);
    lorByNameVer.set(`${normK(v.name)}|${normK(v.version)}`, v.image);
  }
  for (const v of pkm) {
    if (!v.image) continue;
    const num = String(v.collectorNumber || "").split("/")[0].replace(/^0+/, "") || "0";
    pkmIdx.set(`${(v.expansionCode || "").toLowerCase()}|${num}`, v.image);
  }
  return { lorIdx, lorByNameVer, pkmIdx };
}

// Resolve catalog image for a single product (null if no match).
export function matchImage(
  prod: Pick<StoreHubProduct, "name" | "category">,
  game: ShopGame,
  idx: ImageIndexes
): string | null {
  const name = prod.name || "";
  if (game === "lorcana" && /^Lorcana S\d+$/i.test(prod.category || "")) {
    const set = ((prod.category || "").match(/S(\d+)/i) || [])[1];
    const rest = name.replace(/^Lorcana S\d+\s*-\s*/i, "");
    const parts = rest.split(/ - /); // spaced dash only — keeps "Rosy-Cheeked"
    if (parts.length >= 2) {
      const ver = parts[parts.length - 1];
      const cardName = parts.slice(0, -1).join(" - ");
      const img =
        idx.lorIdx.get(`${set}|${normK(cardName)}|${normK(ver)}`) ||
        idx.lorByNameVer.get(`${normK(cardName)}|${normK(ver)}`);
      if (img) return img;
    }
    // single-segment (songs/items): match by name within set, any version
    const cardName = parts.join(" - ");
    const pre = `${set}|${normK(cardName)}|`;
    for (const [k, im] of idx.lorIdx) if (k.startsWith(pre)) return im;
    return null;
  }
  if (game === "pokemon") {
    const pm = name.match(/\(([^)]*)\)\s*$/); // last paren group
    if (!pm) return null;
    const inside = pm[1]; // "U · SV10s T 130/138" | "MA4 062/123" | "- · Tactic 009/019"
    const nm = inside.match(/(\d+)\/\d+\s*$/);
    if (!nm) return null;
    const num = String(+nm[1]);
    // code = token before " T " if present, else first alnum token before num/total
    const code =
      (inside.match(/([A-Za-z0-9-]+)\s+T\s+\d+\//) || [])[1] ||
      (inside.match(/([A-Za-z0-9-]+)\s+\d+\//) || [])[1];
    if (!code) return null;
    return idx.pkmIdx.get(`${code.toLowerCase()}|${num}`) || null;
  }
  return null;
}

// The document written to Firestore `shop-products` (minus updatedAt, added by the route).
export type ShopRow = {
  id: string;
  name: string;
  sku: string | null;
  category: string;
  set: string;
  cardName: string;
  type: ShopProductType;
  game: ShopGame;
  storePrice: number | null;
  priceOverride: number | null;
  price: number | null;
  qty: number;
  trackStock: boolean;
  image: string | null;
};

// Build the shop-products row for one in-stock product. priceOverride is the admin-set
// price already in Firestore (preserved); pass null when none. NOTE: the route writes with
// merge:true and never includes price/priceOverride/listed*/listedBy in the merge when an
// admin value must win — see buildMergePayload below.
export function buildShopRow(
  prod: StoreHubProduct,
  qty: number,
  priceOverride: number | null,
  idx: ImageIndexes
): ShopRow {
  const { type, game } = classify(prod);
  const image = type === "single" ? matchImage(prod, game, idx) : null;
  const storePrice = computeStorePrice(prod.unitPrice);
  const price = priceOverride ?? storePrice;
  return {
    id: prod.id,
    name: prod.name || "",
    sku: prod.sku || null,
    category: prod.category || "",
    set: prod.category || "",
    cardName: type === "single" ? parseSingle(prod.name || "").cardName : prod.name || "",
    type,
    game,
    storePrice,
    priceOverride: priceOverride ?? null,
    price,
    qty,
    trackStock: !!prod.trackStockLevel,
    image,
  };
}

// The fields the cron OWNS and writes every run. Deliberately EXCLUDES everything the
// admin owns, so a merge:true write can never clobber a hand-set value:
//   price         — the admin's manual selling price
//   priceOverride — the admin's price override (also admin-owned; cron never touches it)
//   listed / listedBy / listedAt — the curation "confirm it goes live" flags (separate task)
// The cron therefore only refreshes stock (qty), the auto VAT suggestion (storePrice),
// classification, the catalog image, and metadata. `storePrice` gives the admin the fresh
// suggested price to accept without the sync ever overwriting what they chose.
export type ShopMergePayload = Omit<ShopRow, "price" | "priceOverride">;

export function buildMergePayload(row: ShopRow): ShopMergePayload {
  const { price: _price, priceOverride: _priceOverride, ...rest } = row;
  return rest;
}

// Did the on-hand quantity actually change vs what Firestore already has?
export function stockChanged(previousQty: number | undefined, nextQty: number): boolean {
  return (previousQty ?? -1) !== nextQty;
}
