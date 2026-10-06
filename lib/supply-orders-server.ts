import "server-only";
import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin.ts";
import { allBranchKeys, branchShortName } from "./store-config.ts";
import { fetchSupplyNeeds, hasSupplyNeedsSource, type SupplyNeedItem } from "./storehub-supply-needs.ts";
import {
  SUPPLY_ORDER_COLLECTION,
  allItemsChecked,
  backorderItems,
  bangkokDate,
  cleanNumber,
  cleanText,
  isIsoDate,
  isStorageUrl,
  mismatchAlertText,
  normaliseItems,
  normalisePhotos,
  parseReadOrder,
  problemItems,
  supplyIsOpen,
  type ReadOrderResult,
  type SupplyCheck,
  type SupplyNextStep,
  type SupplyOrder
} from "./supply-orders.ts";

// อ่าน/เขียน sop_supply_orders (ของเติมสต็อก: น้ำ ขนม accessory) ด้วย Admin SDK.
// คนละระบบกับพัสดุการ์ด (sop_parcel_orders) — ไม่แตะกัน. ไม่ผูก KPI.
// ตัวตนมาจาก session ที่ route เสมอ ไม่เชื่อ body.

const NOTIFY_COLLECTION = "vera-notifications";
const READ_MODEL = "claude-sonnet-5";
const MAX_READ_PHOTOS = 6;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function col() {
  return adminDb().collection(SUPPLY_ORDER_COLLECTION);
}

function fromDoc(id: string, data: FirebaseFirestore.DocumentData): SupplyOrder {
  return {
    ...(data as Omit<SupplyOrder, "id">),
    id,
    photos: Array.isArray(data.photos) ? data.photos : [],
    deliveryPhotos: Array.isArray(data.deliveryPhotos) ? data.deliveryPhotos : [],
    items: Array.isArray(data.items) ? data.items : []
  };
}

/** Firestore ปฏิเสธทั้ง doc ถ้ามี undefined ตัวเดียว */
function clean<T extends Record<string, unknown>>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function validBranch(value: unknown): string {
  return typeof value === "string" && allBranchKeys().includes(value) ? value : "bangkae";
}

const shortId = () => randomUUID().slice(0, 8);

/** ออเดอร์ที่ยังไม่จบทั้งหมด + ที่จบแล้วใน recentDays ล่าสุด */
export async function listSupplyOrders(opts: { branch?: string; recentDays?: number } = {}): Promise<SupplyOrder[]> {
  const snap = await col().get();
  const cutoff = new Date(Date.now() - (opts.recentDays ?? 30) * 86_400_000).toISOString();
  return snap.docs
    .map((doc) => fromDoc(doc.id, doc.data()))
    .filter((order) => !opts.branch || order.branch === opts.branch)
    .filter((order) => {
      if (supplyIsOpen(order)) return true;
      const at = order.cancelledAt || order.followUp?.doneAt || order.followUp?.decidedAt || order.receivedAt || order.createdAt;
      return at >= cutoff;
    });
}

export type SupplyCreateInput = {
  branch?: unknown;
  supplier?: unknown;
  orderedDate?: unknown;
  total?: unknown;
  note?: unknown;
  photos?: unknown;
  items?: unknown;
  aiRead?: unknown;
};

export async function createSupplyOrder(input: SupplyCreateInput, by: string): Promise<{ id?: string; error?: string }> {
  const photos = normalisePhotos(input.photos);
  if (!photos.length) return { error: "อัปรูปรายการที่สั่งอย่างน้อย 1 รูป" };
  const { items, error } = normaliseItems(input.items, shortId);
  if (error) return { error };
  const ref = col().doc();
  const order: Omit<SupplyOrder, "id"> = clean({
    branch: validBranch(input.branch),
    supplier: cleanText(input.supplier, 80) || "Makro",
    orderedDate: isIsoDate(input.orderedDate) ? input.orderedDate : bangkokDate(new Date()),
    total: cleanNumber(input.total) || undefined,
    note: cleanText(input.note, 1000) || undefined,
    photos,
    items,
    aiRead: input.aiRead === true || undefined,
    createdBy: by,
    createdAt: new Date().toISOString()
  });
  await ref.set(order);
  return { id: ref.id };
}

/** แก้ออเดอร์ (ก่อนรับของ) — รายการที่ id เดิมยังอยู่ เก็บผลเช็คไว้ */
export async function updateSupplyOrder(id: string, input: SupplyCreateInput): Promise<{ error?: string }> {
  const ref = col().doc(id);
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { error: "ไม่พบออเดอร์" };
    const order = fromDoc(id, snap.data()!);
    if (order.receivedDate) return { error: "รับของเสร็จแล้ว แก้รายการไม่ได้" };
    const rawItems = Array.isArray(input.items) ? input.items : [];
    const { items, error } = normaliseItems(rawItems, (index) => {
      const given = (rawItems[index] as { id?: unknown })?.id;
      return typeof given === "string" && given ? given.slice(0, 40) : shortId();
    });
    if (error) return { error };
    const previous = new Map(order.items.map((item) => [item.id, item]));
    const merged = items.map((item) => {
      const old = previous.get(item.id);
      return old?.check
        ? { ...item, check: old.check, receivedQty: old.receivedQty, checkNote: old.checkNote, checkedBy: old.checkedBy, checkedAt: old.checkedAt }
        : item;
    });
    const photos = normalisePhotos(input.photos);
    tx.update(
      ref,
      clean({
        supplier: cleanText(input.supplier, 80) || order.supplier,
        orderedDate: isIsoDate(input.orderedDate) ? input.orderedDate : order.orderedDate,
        branch: input.branch ? validBranch(input.branch) : order.branch,
        total: cleanNumber(input.total) ?? null,
        note: cleanText(input.note, 1000) || null,
        photos: photos.length ? photos : order.photos,
        items: merged
      })
    );
    return {};
  });
}

export async function cancelSupplyOrder(id: string, cancelled: boolean, by: string): Promise<{ error?: string }> {
  const ref = col().doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { error: "ไม่พบออเดอร์" };
  await ref.update(
    cancelled
      ? { cancelled: true, cancelledBy: by, cancelledAt: new Date().toISOString() }
      : { cancelled: FieldValue.delete(), cancelledBy: FieldValue.delete(), cancelledAt: FieldValue.delete() }
  );
  return {};
}

/** เช็คของทีละรายการตอนรับ (check = null คือย้อน) */
export async function checkSupplyItem(
  id: string,
  itemId: string,
  check: SupplyCheck | null,
  receivedQty: number | undefined,
  note: string,
  by: string
): Promise<{ error?: string }> {
  const ref = col().doc(id);
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { error: "ไม่พบออเดอร์" };
    const order = fromDoc(id, snap.data()!);
    if (order.cancelled) return { error: "ออเดอร์นี้ยกเลิกแล้ว" };
    if (order.receivedDate) return { error: "รับของเสร็จไปแล้ว — ถ้าจะแก้ ให้กด \"แก้ผลรับของ\" ก่อน" };
    const index = order.items.findIndex((item) => item.id === itemId);
    if (index < 0) return { error: "ไม่พบรายการนี้" };
    if (check && check !== "ok" && !note.trim() && receivedQty === undefined) {
      return { error: "บอกหน่อยว่าไม่ตรงยังไง (ได้มากี่ชิ้น หรือพิมพ์โน้ต)" };
    }
    const base = { ...order.items[index] };
    delete base.check;
    delete base.receivedQty;
    delete base.checkNote;
    delete base.checkedBy;
    delete base.checkedAt;
    const item = check
      ? clean({
          ...base,
          check,
          receivedQty: check === "ok" ? undefined : receivedQty,
          checkNote: check === "ok" ? undefined : cleanText(note, 300) || undefined,
          checkedBy: by,
          checkedAt: new Date().toISOString()
        })
      : base;
    const items = [...order.items];
    items[index] = item;
    tx.update(ref, { items });
    return {};
  });
}

/** รับของเสร็จ — ต้องเช็คครบทุกรายการ. คืน order ไว้ส่ง Telegram ถ้ามีของไม่ตรง */
export async function finishReceiving(
  id: string,
  input: { deliveryPhotos?: unknown; receiveNote?: unknown },
  by: string
): Promise<{ error?: string; order?: SupplyOrder }> {
  const ref = col().doc(id);
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { error: "ไม่พบออเดอร์" };
    const order = fromDoc(id, snap.data()!);
    if (order.receivedDate) return { error: "รับของเสร็จไปแล้ว" };
    if (!allItemsChecked(order)) return { error: "ยังเช็คไม่ครบทุกรายการ" };
    const now = new Date();
    const patch = clean({
      receivedDate: bangkokDate(now),
      receivedAt: now.toISOString(),
      receivedBy: by,
      deliveryPhotos: normalisePhotos(input.deliveryPhotos),
      receiveNote: cleanText(input.receiveNote, 1000) || undefined
    });
    tx.update(ref, patch);
    return { order: { ...order, ...patch } };
  });
}

/** ย้อน "รับของเสร็จ" (กดผิด) — ทำได้ถ้ายังไม่ได้เริ่มติดต่อซัพ */
export async function reopenReceiving(id: string): Promise<{ error?: string }> {
  const ref = col().doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { error: "ไม่พบออเดอร์" };
  const order = fromDoc(id, snap.data()!);
  if (order.followUp?.contactedAt) return { error: "เริ่มติดต่อซัพไปแล้ว ย้อนไม่ได้" };
  await ref.update({
    receivedDate: FieldValue.delete(),
    receivedAt: FieldValue.delete(),
    receivedBy: FieldValue.delete()
  });
  return {};
}

export type FollowUpInput = {
  step?: unknown;
  channel?: unknown;
  outcome?: unknown;
  nextStep?: unknown;
  nextNote?: unknown;
  nextDueDate?: unknown;
  doneNote?: unknown;
};

/**
 * เช็คลิสต์ติดต่อซัพ ทีละขั้น:
 *  contact = ติดต่อแล้ว (ช่องทาง) · decide = ได้เรื่องว่าอย่างไร + งานถัดไป · done = งานถัดไปเสร็จ
 *  undo-contact / undo-decide / undo-done = ย้อนขั้นนั้น
 * nextStep = resend → เปิดออเดอร์ค้างส่ง (ของที่ขาด) ให้ขึ้นรอรับรอบหน้าอัตโนมัติ
 */
export async function updateFollowUp(id: string, input: FollowUpInput, by: string): Promise<{ error?: string; backorderId?: string }> {
  const ref = col().doc(id);
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { error: "ไม่พบออเดอร์" };
    const order = fromDoc(id, snap.data()!);
    if (!order.receivedDate || !problemItems(order).length) return { error: "ออเดอร์นี้ไม่มีของไม่ตรงให้ตาม" };
    const followUp = { ...(order.followUp || {}) };
    const now = new Date().toISOString();
    const step = typeof input.step === "string" ? input.step : "";

    if (step === "contact") {
      followUp.contactedAt = now;
      followUp.contactedBy = by;
      const channel = cleanText(input.channel, 60);
      if (channel) followUp.channel = channel;
    } else if (step === "decide") {
      if (!followUp.contactedAt) return { error: "ติ๊ก \"ติดต่อซัพแล้ว\" ก่อน" };
      const outcome = cleanText(input.outcome, 1000);
      if (!outcome) return { error: "พิมพ์ว่าซัพตอบว่าอย่างไร" };
      const raw = typeof input.nextStep === "string" ? input.nextStep : "";
      const nextStep = (["resend", "refund", "return", "accept", "other"] as const).find((value) => value === raw) as SupplyNextStep | undefined;
      if (!nextStep) return { error: "เลือกงานถัดไป" };
      followUp.outcome = outcome;
      followUp.nextStep = nextStep;
      followUp.nextNote = cleanText(input.nextNote, 500) || undefined;
      followUp.nextDueDate = isIsoDate(input.nextDueDate) ? input.nextDueDate : undefined;
      followUp.decidedAt = now;
      followUp.decidedBy = by;
      if (nextStep === "resend" && !followUp.backorderId) {
        const items = backorderItems(order, () => shortId());
        if (items.length) {
          const backRef = col().doc();
          tx.set(
            backRef,
            clean({
              branch: order.branch,
              supplier: order.supplier,
              orderedDate: followUp.nextDueDate || bangkokDate(new Date()),
              photos: order.photos,
              items,
              note: `ค้างส่งจากออเดอร์ ${order.orderedDate} — ${outcome}`,
              parentId: order.id,
              createdBy: by,
              createdAt: now
            })
          );
          followUp.backorderId = backRef.id;
        }
      }
    } else if (step === "done") {
      if (!followUp.nextStep) return { error: "ยังไม่ได้เลือกงานถัดไป" };
      followUp.doneAt = now;
      followUp.doneBy = by;
      followUp.doneNote = cleanText(input.doneNote, 500) || undefined;
    } else if (step === "undo-contact") {
      if (followUp.decidedAt) return { error: "ย้อนขั้น \"ได้เรื่องว่า\" ก่อน" };
      delete followUp.contactedAt;
      delete followUp.contactedBy;
      delete followUp.channel;
    } else if (step === "undo-decide") {
      if (followUp.doneAt) return { error: "ย้อนขั้น \"เสร็จแล้ว\" ก่อน" };
      if (followUp.backorderId) {
        const backRef = col().doc(followUp.backorderId);
        const back = await tx.get(backRef);
        if (back.exists && fromDoc(back.id, back.data()!).items.some((item) => item.check)) {
          return { error: "ของค้างส่งเริ่มรับไปแล้ว ย้อนไม่ได้" };
        }
        if (back.exists) tx.delete(backRef);
      }
      for (const key of ["outcome", "nextStep", "nextNote", "nextDueDate", "decidedAt", "decidedBy", "backorderId"] as const) {
        delete followUp[key];
      }
    } else if (step === "undo-done") {
      delete followUp.doneAt;
      delete followUp.doneBy;
      delete followUp.doneNote;
    } else {
      return { error: "ไม่รู้จักขั้นนี้" };
    }

    tx.update(ref, { followUp: clean(followUp) });
    return { backorderId: followUp.backorderId };
  });
}

export async function notifyOwnerSupply(message: string): Promise<void> {
  await adminDb().collection(NOTIFY_COLLECTION).add({
    message,
    status: "pending",
    source: "sop-supply",
    createdAt: FieldValue.serverTimestamp()
  });
}

export function supplyMismatchAlert(order: SupplyOrder): string {
  return mismatchAlertText(order, branchShortName(order.branch));
}

// ── อ่านรูปรายการที่สั่ง ───────────────────────────────────────────────────

async function imageBlock(url: string): Promise<Record<string, unknown> | null> {
  if (!isStorageUrl(url)) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  const type = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
  if (!/^image\/(jpeg|png|gif|webp)$/.test(type)) return null;
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) return null;
  return { type: "image", source: { type: "base64", media_type: type, data: bytes.toString("base64") } };
}

/**
 * ส่งรูปบิล/แคปหน้าจอให้ Claude แตกเป็นรายการ + จับคู่กับสินค้าที่ร้านติดตามใน StoreHub
 * (ลิสต์ของที่ต้องสั่ง) — ผลเป็นแค่ร่าง คนสั่งตรวจ/แก้ก่อนบันทึกเสมอ.
 */
export async function readOrderPhotos(urls: string[], branch: string): Promise<{ result?: ReadOrderResult; error?: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { error: "ระบบอ่านรูปยังไม่ได้ตั้งค่า — พิมพ์รายการเองได้เลย" };
  const photos = urls.filter(isStorageUrl).slice(0, MAX_READ_PHOTOS);
  if (!photos.length) return { error: "อัปรูปรายการที่สั่งก่อน" };

  let candidates: SupplyNeedItem[] = [];
  if (hasSupplyNeedsSource()) {
    try {
      const needs = await fetchSupplyNeeds(undefined, branch);
      candidates = [...(needs.plan?.must ?? needs.items), ...(needs.plan?.suggested ?? [])].filter((item) => item.productId);
    } catch {
      candidates = [];
    }
  }
  const known = new Set(candidates.map((item) => item.productId as string));

  const images = (await Promise.all(photos.map((url) => imageBlock(url).catch(() => null)))).filter(Boolean) as Record<string, unknown>[];
  if (!images.length) return { error: "เปิดรูปไม่ได้ ลองอัปใหม่" };

  const catalog = candidates.length
    ? candidates.map((item) => `${item.productId}\t${item.name}`).join("\n")
    : "(ไม่มี)";
  const prompt = [
    "รูปนี้คือรายการสินค้าที่ร้านสั่งซื้อไปแล้ว (บิล ใบเสร็จ หรือแคปหน้าจอแอป เช่น Makro) ของร้านการ์ดเกม — ส่วนใหญ่เป็นน้ำ ขนม อุปกรณ์.",
    "แตกเป็นรายการสินค้าที่สั่งทั้งหมด: ชื่อสินค้าตามที่เห็น, จำนวน (qty เป็นจำนวนหน่วยที่สั่ง), หน่วยถ้ามี (แพ็ค ลัง ขวด ชิ้น).",
    "ข้ามบรรทัดที่ไม่ใช่สินค้า (ค่าส่ง ส่วนลด ภาษี ยอดรวม). รายการเดียวกันหลายบรรทัดให้รวมจำนวน. ถ้ามีหลายรูปเป็นบิลเดียวกัน อย่านับซ้ำ.",
    "ถ้าสินค้าตรงกับสินค้าในร้านด้านล่าง (ชื่อคนละแบบแต่ของเดียวกัน) ใส่ productId นั้น ถ้าไม่แน่ใจไม่ต้องใส่.",
    "",
    "สินค้าในร้าน (productId<TAB>ชื่อ):",
    catalog,
    "",
    'ตอบเป็น JSON อย่างเดียว: {"supplier":"ชื่อร้านที่สั่ง","orderedDate":"YYYY-MM-DD หรือ null","total":ยอดรวมบาทหรือnull,"items":[{"name":"...","qty":1,"unit":"...","productId":"...หรือnull"}]}'
  ].join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: READ_MODEL,
      max_tokens: 4000,
      messages: [{ role: "user", content: [...images, { type: "text", text: prompt }] }]
    })
  });
  if (!res.ok) return { error: "อ่านรูปไม่สำเร็จ — พิมพ์รายการเองได้" };
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = (data.content || []).map((block) => block.text || "").join("");
  const result = parseReadOrder(text, known);
  if (!result.items.length) return { error: "อ่านรายการจากรูปไม่ออก — ลองรูปที่ชัดกว่านี้ หรือพิมพ์เอง" };
  return { result };
}
