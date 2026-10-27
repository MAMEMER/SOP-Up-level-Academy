import { NextResponse } from "next/server";
import { actor, forbidden, isAdmin } from "../../../../lib/api-firestore.ts";
import { searchProducts } from "../../../../lib/receivings.ts";
import { productCatalogue } from "../../../../lib/receivings-store.ts";

// Product picker for รับของเข้า: search the StoreHub catalogue (cached 10 min server-side) by
// name / SKU / barcode. Returns ids + names only — no prices or costs.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user } = await actor();
  if (!isAdmin(user)) return forbidden();
  const q = (new URL(request.url).searchParams.get("q") || "").slice(0, 80);
  try {
    return NextResponse.json({ products: searchProducts(await productCatalogue(), q, 30) });
  } catch (error) {
    return NextResponse.json({ error: "storehub_failed", detail: String(error) }, { status: 502 });
  }
}
