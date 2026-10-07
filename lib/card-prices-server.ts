import "server-only";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import type { CardWatch, PriceFeedback, PriceOverride, RefMeta, RefRow } from "./card-prices.ts";

export const PRICES = "card_ref_prices";
export const FEEDBACK = "card_price_feedback";
export const OVERRIDES = "card_ref_overrides";
export const WATCH = "card_watch";

export type CardPricesData = {
  meta: RefMeta | null;
  rows: RefRow[];
  feedback: PriceFeedback[];
  overrides: PriceOverride[];
  watches: CardWatch[];
};

export async function loadCardPrices(): Promise<CardPricesData> {
  if (!hasAdminCredentials()) return { meta: null, rows: [], feedback: [], overrides: [], watches: [] };
  const db = adminDb();
  const [prices, feedback, overrides, watches] = await Promise.all([
    db.collection(PRICES).get(),
    db.collection(FEEDBACK).where("status", "==", "open").get(),
    db.collection(OVERRIDES).get(),
    db.collection(WATCH).where("active", "==", true).get()
  ]);
  let meta: RefMeta | null = null;
  const rows: RefRow[] = [];
  for (const doc of prices.docs) {
    if (doc.id === "_meta") meta = doc.data() as RefMeta;
    else rows.push(...(((doc.data().rows as RefRow[]) ?? [])));
  }
  return {
    meta,
    rows,
    feedback: feedback.docs.map((d) => ({ ...(d.data() as PriceFeedback), id: d.id })),
    overrides: overrides.docs.map((d) => ({ ...(d.data() as PriceOverride), id: d.id })),
    watches: watches.docs
      .map((d) => ({ ...(d.data() as CardWatch), id: d.id }))
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
  };
}
