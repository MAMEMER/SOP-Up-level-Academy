import { NextResponse } from "next/server";
import { masterplanApiMember } from "../../../../lib/masterplan-auth.ts";
import { bad, editorsOnly, readBody, storeError, text } from "../../../../lib/masterplan-api.ts";
import { getOne, putOne, saveDocVersion } from "../../../../lib/masterplan-store.ts";
import {
  MAX_PRODUCTS_CSV_BYTES,
  PRODUCTS_SLUG,
  PRODUCTS_TITLE,
  parseStorehubExport,
  summarizeProducts,
  type ProductsSnapshot
} from "../../../../lib/masterplan-products.ts";

// Upload a StoreHub product export → regenerate the reference doc "ข้อมูลสินค้า StoreHub"
// (whole doc replaced, version bump, changelog line) and keep a compact snapshot in
// mp_meta/products-snapshot so the next upload can report what changed. Editors only.
// The browser unzips .zip exports and sends the CSV text.

export const dynamic = "force-dynamic";

const SNAPSHOT_ID = "products-snapshot";

export async function POST(request: Request) {
  const auth = await masterplanApiMember();
  if (auth.error) return auth.error;
  const member = auth.member;
  if (!member.editor) return editorsOnly();

  const body = await readBody(request);
  const csv = text(body.csv);
  const fileName = text(body.fileName).trim() || "storehub.csv";
  if (!csv.trim()) return bad("ไฟล์ว่าง");
  if (csv.length > MAX_PRODUCTS_CSV_BYTES) return bad("ไฟล์ใหญ่เกินไป");

  const parsed = parseStorehubExport(csv);
  if (!parsed.ok) return bad(parsed.error);

  try {
    const previous = await getOne<ProductsSnapshot>("mp_meta", SNAPSHOT_ID);
    const summary = summarizeProducts(parsed.value, { fileName, uploadedAt: new Date().toISOString(), uploadedBy: member.key, uploadedByName: member.name }, previous);
    const doc = await saveDocVersion({
      slug: PRODUCTS_SLUG,
      title: PRODUCTS_TITLE,
      baseVersion: null,
      by: member.key,
      compute: () => summary.markdown,
      changelog: () => ({ summary: `อัปเดตข้อมูลสินค้าจากไฟล์ StoreHub: ${fileName.slice(0, 120)} (${summary.snapshot.items.toLocaleString("en-US")} รายการ)`, proposalCode: null })
    });
    await putOne<ProductsSnapshot>("mp_meta", SNAPSHOT_ID, summary.snapshot);
    return NextResponse.json({ ok: true, version: doc.version, items: summary.snapshot.items, exportedAt: summary.snapshot.exportedAt });
  } catch (error) {
    return storeError(error);
  }
}
