import { NextResponse } from "next/server";
import { isCronOrAdmin } from "../../../../lib/cron-auth.ts";
import { hasStoreHubCreds, storeHubGet } from "../../../../lib/storehub-api.ts";
import { adminDb, hasAdminCredentials } from "../../../../lib/firebase-admin.ts";
import { branchConfigs } from "../../../../lib/store-config.ts";
import { FLOWER_BILLS_COLLECTION } from "../../../../lib/flower-garden.ts";
import { isFlowerMonth } from "../../../../lib/flower-target.ts";
import { billExclusion, kindByProductId, type ShItem, type ShProduct } from "../../../../lib/flower-exclusions.ts";

// แท็กบิลดอกไม้ด้วยยอดค่ากิจกรรม/พรีออเดอร์ (excludedEvent / excludedPreorder) — ฐานเป้าดอกไม้หักส่วนนี้ออก
// `flower_bills` เก็บแค่ยอดรวมของบิล จึงต้องกลับไปดูรายการสินค้าในบิลจริงจาก StoreHub
// Cron วันละสองรอบแท็ก 3 วันล่าสุด · แอดมินเรียก ?month=YYYY-MM เพื่อแท็กย้อนหลังทั้งเดือน

export const maxDuration = 60;

const RATE_GAP_MS = 350; // StoreHub จำกัด 3 ครั้ง/วินาที
const CHUNK_DAYS = 5;
const DAY = 24 * 3600 * 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type ShTxn = { refId?: string; transactionType?: string; isCancelled?: boolean; items?: ShItem[] };

function rangeFor(month: string | null): [number, number] {
  if (month) {
    const [y, m] = month.split("-").map(Number);
    // เดือนตามเวลาไทย = 17:00 UTC ของวันสุดท้ายเดือนก่อน
    return [Date.UTC(y, m - 1, 1) - 7 * 3600 * 1000, Date.UTC(y, m, 1) - 7 * 3600 * 1000];
  }
  const now = Date.now();
  return [now - 3 * DAY, now];
}

export async function GET(request: Request) {
  if (!(await isCronOrAdmin(request))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!hasStoreHubCreds()) return NextResponse.json({ error: "storehub_not_configured" }, { status: 503 });
  if (!hasAdminCredentials()) return NextResponse.json({ error: "firebase_not_configured" }, { status: 503 });

  const asked = new URL(request.url).searchParams.get("month");
  const month = isFlowerMonth(asked) ? asked : null;
  const [fromMs, toMs] = rangeFor(month);

  try {
    const kinds = kindByProductId(await storeHubGet<ShProduct[]>("/products"));

    const txns: ShTxn[] = [];
    for (const branch of branchConfigs) {
      if (!branch.storeHubStoreId) continue;
      for (let start = fromMs; start < toMs; start += CHUNK_DAYS * DAY) {
        const end = Math.min(start + CHUNK_DAYS * DAY, toMs);
        await sleep(RATE_GAP_MS);
        const path = `/transactions?from=${new Date(start).toISOString()}&to=${new Date(end).toISOString()}&storeId=${branch.storeHubStoreId}`;
        txns.push(...(await storeHubGet<ShTxn[]>(path)));
      }
    }

    const db = adminDb();
    const bills = await db
      .collection(FLOWER_BILLS_COLLECTION)
      .where("transactionTime", ">=", new Date(fromMs - DAY).toISOString())
      .where("transactionTime", "<", new Date(toMs + DAY).toISOString())
      .get();
    const known = new Set(bills.docs.map((doc) => doc.id));

    const taggedAt = new Date().toISOString();
    let batch = db.batch();
    let pending = 0;
    let tagged = 0;
    let excludedEvent = 0;
    let excludedPreorder = 0;
    for (const txn of txns) {
      if (!txn.refId || txn.transactionType !== "Sale" || txn.isCancelled || !known.has(txn.refId)) continue;
      const exclusion = billExclusion(txn.items, kinds);
      batch.update(db.collection(FLOWER_BILLS_COLLECTION).doc(txn.refId), { ...exclusion, exclusionTaggedAt: taggedAt });
      excludedEvent += exclusion.excludedEvent;
      excludedPreorder += exclusion.excludedPreorder;
      tagged += 1;
      pending += 1;
      if (pending === 400) {
        await batch.commit();
        batch = db.batch();
        pending = 0;
      }
    }
    if (pending) await batch.commit();

    return NextResponse.json({
      ok: true,
      month,
      from: new Date(fromMs).toISOString(),
      to: new Date(toMs).toISOString(),
      transactions: txns.length,
      bills: known.size,
      tagged,
      excludedEvent: Math.round(excludedEvent),
      excludedPreorder: Math.round(excludedPreorder)
    });
  } catch (error) {
    return NextResponse.json({ error: "tag_failed", detail: String(error) }, { status: 500 });
  }
}
