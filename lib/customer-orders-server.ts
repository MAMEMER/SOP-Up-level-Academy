import "server-only";
import { JWT } from "google-auth-library";
import { adminDb } from "./firebase-admin.ts";
import {
  applyLot,
  applyFulfillment,
  DEFAULT_LOT,
  fromLorcana13,
  fromMa6,
  fromMat,
  fromReservation,
  fromShop,
  sortOrders,
  type CustomerOrder,
  type DeliveryRaw,
  type FulfillmentRecord,
  type LotState,
  type OrderSource,
  type ReservationRaw,
  type ShopRaw,
  type OrderMeta,
  applyMeta,
  MAX_ORDER_PHOTOS,
  SET14_SHEET_HEADER,
  set14SheetCells,
  sheetRowsFor
} from "./customer-orders.ts";

// อ่านออเดอร์ทุกช่องทาง (อ่านอย่างเดียว) + สิ่งที่พนักงานบันทึกใน sop_order_fulfillment.
// ชีตอ่านด้วย service account ตัวเดียวกับ Firestore (แชร์ชีตให้ SA แบบผู้อ่านไว้แล้ว).

export const FULFILLMENT = "sop_order_fulfillment";
export const SOURCES = "sop_order_sources";
export const META = "sop_order_meta";

const SHEETS = {
  ma6: { id: "1QeoXLtY1NgFkuCX_x3PFwRf9JqfI7jpP2lJv6dx1XEc", range: "Form Responses 1!A1:Q" },
  lorcana13: { id: "1IpEqQgX6IuMoENzD1lfR8BsfBwgecGYHUD5WDqSlyiM", range: "Responses!A1:AD" },
  mat: { id: "1GDIk7yo0B2RvK1PVlnR2HXXzT3OJVeBl8gNdhcjEUOA", range: "Orders!A1:P" }
} as const;

let jwt: JWT | null = null;
async function sheetRows(sheet: keyof typeof SHEETS): Promise<string[][]> {
  jwt ??= new JWT({
    email: process.env.FIREBASE_CLIENT_EMAIL,
    key: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });
  const { token } = await jwt.getAccessToken();
  const { id, range } = SHEETS[sheet];
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`อ่านชีต ${sheet} ไม่ได้ (${res.status})`);
  return ((await res.json()) as { values?: string[][] }).values || [];
}

function iso(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number") return new Date(v).toISOString();
  const t = v as { toDate?: () => Date };
  return t.toDate ? t.toDate().toISOString() : null;
}

const bangkokToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

export type OrdersFeed = {
  orders: Array<CustomerOrder & { record?: FulfillmentRecord }>;
  lots: Record<OrderSource, LotState>;
  errors: string[];
  loadedAt: string;
};

let cache: { at: number; feed: OrdersFeed } | null = null;
const TTL_MS = 30_000;

export function invalidateOrders() {
  cache = null;
}

export async function fetchCustomerOrders(): Promise<OrdersFeed> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.feed;
  const db = adminDb();
  const errors: string[] = [];
  const safe = async <T,>(label: string, run: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      return fallback;
    }
  };

  const [shopSnap, taskSnap, set14, bundle, prerelease, ma6, l13, mat, recSnap] = await Promise.all([
    safe("ร้านออนไลน์", () => db.collection("shop-orders").select("status", "customer", "items", "total", "createdAt", "shippedAt").get(), null),
    safe("ใบงานส่งของ", () => db.collection("delivery_tasks").select("orderId", "status", "trackingNumber", "shippedAt").get(), null),
    safe("Set 14", () => db.collection("set14-reservations").get(), null),
    safe("Bundle", () => db.collection("bundle-reservations").get(), null),
    safe("Pre-release", () => db.collection("prerelease-reservations").get(), null),
    safe("ชีต MA6", () => sheetRows("ma6"), []),
    safe("ชีต Lorcana 13", () => sheetRows("lorcana13"), []),
    safe("ชีต Mega Tactic", () => sheetRows("mat"), []),
    safe("บันทึกการส่งมอบ", () => db.collection(FULFILLMENT).get(), null)
  ]);
  const metaSnap = await safe("ข้อมูลที่พนักงานแก้", () => db.collection(META).get(), null);
  const metas = new Map<string, OrderMeta>();
  metaSnap?.docs.forEach((d) => metas.set(d.id, d.data() as OrderMeta));
  const lots = { ...DEFAULT_LOT };
  const srcSnap = await safe("สถานะล็อต", () => db.collection(SOURCES).get(), null);
  srcSnap?.docs.forEach((d) => {
    const lot = d.data().lot;
    if (d.id in lots && (lot === "waiting" || lot === "open" || lot === "closed")) lots[d.id as OrderSource] = lot;
  });

  const tasks = new Map<string, DeliveryRaw>();
  taskSnap?.docs.forEach((d) => {
    const v = d.data();
    if (v.orderId) tasks.set(String(v.orderId), { id: d.id, orderId: String(v.orderId), status: v.status, trackingNumber: v.trackingNumber, shippedAt: v.shippedAt });
  });

  const out: CustomerOrder[] = [];
  shopSnap?.docs.forEach((d) => {
    const v = d.data();
    const o = fromShop({ id: d.id, status: v.status, customer: v.customer, items: v.items, total: v.total, createdAt: iso(v.createdAt), shippedAt: iso(v.shippedAt) }, tasks.get(d.id));
    if (o) out.push(o);
  });
  const now = Date.now();
  for (const [source, snap] of [["set14", set14], ["bundle", bundle], ["prerelease", prerelease]] as const) {
    snap?.docs.forEach((d) => {
      const v = d.data();
      const raw: ReservationRaw = { ...(v as ReservationRaw), id: d.id, createdAt: iso(v.createdAt), expiresAt: iso(v.expiresAt) };
      const o = fromReservation(source, raw, now);
      if (o) out.push(o);
    });
  }
  ma6.slice(1).forEach((row, i) => {
    const o = fromMa6(row, i + 2);
    if (o) out.push(o);
  });
  const l13Header = l13[0] || [];
  l13.slice(1).forEach((row, i) => {
    const o = fromLorcana13(row, l13Header, i + 2);
    if (o) out.push(o);
  });
  const today = bangkokToday();
  mat.slice(1).forEach((row) => {
    const o = fromMat(row, today);
    if (o) out.push(o);
  });

  const records = new Map<string, FulfillmentRecord>();
  recSnap?.docs.forEach((d) => records.set(d.id, d.data() as FulfillmentRecord));

  const feed: OrdersFeed = {
    orders: sortOrders(out.map((o) => applyFulfillment(applyLot(applyMeta(o, metas.get(o.key)), lots[o.source]), records.get(o.key)))),
    lots,
    errors,
    loadedAt: new Date().toISOString()
  };
  cache = { at: Date.now(), feed };
  return feed;
}

// ---------- บันทึกการส่งมอบ ----------
const KEY_RE = /^(shop|set14|bundle|prerelease|ma6|lorcana13|mat)__[A-Za-z0-9_-]{1,80}$/;
export const isOrderKey = (key: string) => KEY_RE.test(key);

/** บันทึกว่าลูกค้ารับแล้ว / ส่งแล้ว / รับไปบางส่วน — ทุกครั้งเก็บลง log ด้วย ย้อนดูได้ว่าใครกดอะไร */
export async function recordHandover(
  key: string,
  input: { state: FulfillmentRecord["state"]; tracking?: string; note?: string },
  by: string,
  byName: string
): Promise<void> {
  const db = adminDb();
  // ใบงานส่งของหาเองจาก orderId ฝั่ง server — ไม่เชื่อ id จาก browser
  const deliveryTaskId =
    key.startsWith("shop__") && input.state === "shipped"
      ? (await db.collection("delivery_tasks").where("orderId", "==", key.slice(6)).limit(1).get()).docs[0]?.id
      : undefined;
  const rec: FulfillmentRecord = {
    state: input.state,
    by,
    byName,
    at: new Date().toISOString(),
    ...(input.tracking ? { tracking: input.tracking } : {}),
    ...(input.note ? { note: input.note } : {})
  };
  const batch = db.batch();
  batch.set(db.collection(FULFILLMENT).doc(key), rec);
  batch.set(db.collection(`${FULFILLMENT}_log`).doc(), { key, action: "set", ...rec });
  // ร้านออนไลน์: ปิดใบงานส่งของตัวเดิมด้วย จะได้ไม่ค้างบนหน้าหลักของกะ
  if (deliveryTaskId) {
    batch.update(db.collection("delivery_tasks").doc(deliveryTaskId), {
      status: "shipped",
      trackingNumber: input.tracking || "",
      shippedBy: by,
      shippedAt: rec.at
    });
  }
  await batch.commit();
  invalidateOrders();
  if (key.startsWith("set14__")) await syncSet14Sheet(key.slice(7));
}

// ---------- เขียนสถานะรับของกลับไปที่ชีตออเดอร์ Set 14 ----------
// แชมป์อยากเห็นในชีตด้วย — Firestore ยังเป็นตัวจริง ถ้าชีตพังการบันทึกไม่พัง
const SET14_SHEET_ID = "1FxgqJmzfdwlGp3Qm1e_d9tip985VkJl9Yh28dLfUbG4";
const SET14_TAB = "ออเดอร์";
let writeJwt: JWT | null = null;
async function syncSet14Sheet(reservationId: string): Promise<void> {
  try {
    const db = adminDb();
    const key = `set14__${reservationId}`;
    const [snap, recDoc, metaDoc] = await Promise.all([
      db.collection("set14-reservations").doc(reservationId).get(),
      db.collection(FULFILLMENT).doc(key).get(),
      db.collection(META).doc(key).get()
    ]);
    const orderId = String(snap.get("orderId") || "");
    writeJwt ??= new JWT({
      email: process.env.FIREBASE_CLIENT_EMAIL,
      key: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });
    const { token } = await writeJwt.getAccessToken();
    const base = `https://sheets.googleapis.com/v4/spreadsheets/${SET14_SHEET_ID}/values`;
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const colB = await fetch(`${base}/${encodeURIComponent(`${SET14_TAB}!B:B`)}`, { headers, cache: "no-store" });
    if (!colB.ok) throw new Error(`read ${colB.status}`);
    const rows = sheetRowsFor(((await colB.json()) as { values?: string[][] }).values || [], [orderId, reservationId]);
    if (!rows.length) throw new Error(`no sheet row for ${reservationId}`);
    const cells = set14SheetCells(
      recDoc.exists ? (recDoc.data() as FulfillmentRecord) : null,
      metaDoc.exists ? (metaDoc.data() as OrderMeta) : null,
      { method: String(snap.get("fulfillment") || "pickup"), address: String(snap.get("address") || "") }
    );
    const data = [
      { range: `${SET14_TAB}!T1:Y1`, values: [[...SET14_SHEET_HEADER]] },
      ...rows.map((n) => ({ range: `${SET14_TAB}!T${n}:Y${n}`, values: [cells] }))
    ];
    const res = await fetch(`${base}:batchUpdate`, {
      method: "POST",
      headers,
      body: JSON.stringify({ valueInputOption: "RAW", data })
    });
    if (!res.ok) throw new Error(`write ${res.status} ${(await res.text()).slice(0, 160)}`);
  } catch (err) {
    console.error("[orders] set14 sheet sync failed", reservationId, err);
  }
}

export async function undoHandover(key: string, by: string, byName: string): Promise<void> {
  const db = adminDb();
  const batch = db.batch();
  batch.delete(db.collection(FULFILLMENT).doc(key));
  batch.set(db.collection(`${FULFILLMENT}_log`).doc(), { key, action: "undo", by, byName, at: new Date().toISOString() });
  await batch.commit();
  invalidateOrders();
  if (key.startsWith("set14__")) await syncSet14Sheet(key.slice(7));
}

/** วิธีรับ / ที่อยู่ / ค่าส่งเพิ่ม / รูปหลักฐาน — เขียนทับทั้งก้อน และเก็บ log ทุกครั้ง */
export async function saveOrderMeta(
  key: string,
  input: { method?: "pickup" | "ship"; address: string; shipFeePaid: boolean; photos: string[] },
  by: string,
  byName: string
): Promise<void> {
  const db = adminDb();
  const meta: OrderMeta = {
    ...(input.method ? { method: input.method } : {}),
    address: input.address,
    shipFeePaid: input.shipFeePaid,
    photos: input.photos.slice(0, MAX_ORDER_PHOTOS),
    by,
    byName,
    at: new Date().toISOString()
  };
  const batch = db.batch();
  batch.set(db.collection(META).doc(key), meta);
  batch.set(db.collection(`${FULFILLMENT}_log`).doc(), { key, action: "meta", ...meta });
  await batch.commit();
  invalidateOrders();
  if (key.startsWith("set14__")) await syncSet14Sheet(key.slice(7));
}

export async function setSourceLot(source: OrderSource, lot: LotState, by: string): Promise<void> {
  const at = new Date().toISOString();
  const db = adminDb();
  await db.collection(SOURCES).doc(source).set({ lot, by, at });
  await db.collection(`${FULFILLMENT}_log`).add({ key: `lot:${source}`, action: "lot", lot, by, at });
  invalidateOrders();
}
