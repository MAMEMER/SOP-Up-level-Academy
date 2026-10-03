import "server-only";
import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminBucket, adminDb, adminStorageBucket } from "./firebase-admin.ts";
import { onePerStaffDay } from "./planner-kpi.ts";
import { restListCollection } from "./firestore-rest.ts";
import { allBranchKeys } from "./store-config.ts";
import {
  PARCEL_COLLECTION,
  allItemsHandled,
  arrivalDueDate,
  bangkokDate,
  cleanParcelNumber,
  cleanParcelText,
  isIsoDate,
  normaliseItems,
  normalisePhotos,
  ownerAlertMessage,
  parcelsNeedingOwnerAlert,
  type ParcelCheck,
  type ParcelItem,
  type ParcelOrder,
  type ParcelProblem
} from "./parcel-orders.ts";

// อ่าน/เขียน sop_parcel_orders ด้วย Admin SDK (ตัวตนมาจาก session ที่ route เสมอ ไม่เชื่อ body).
// ไม่แตะ work_assignments / sop_score_adjustments — KPI ของพัสดุคิดสด (derived) ที่
// lib/performance-daily-store.ts จากข้อมูลในคอลเลกชันนี้ เหมือน auto no-progress.

const VIDEO_PREFIX = "sop-parcel-videos";
/** วิดีโอแกะกล่องจากมือถือ — 1–2 นาทีที่ 1080p ราว 100–300MB */
export const MAX_VIDEO_BYTES = 600 * 1024 * 1024;
const NOTIFY_COLLECTION = "vera-notifications";

function col() {
  return adminDb().collection(PARCEL_COLLECTION);
}

function fromDoc(id: string, data: FirebaseFirestore.DocumentData): ParcelOrder {
  return {
    ...(data as Omit<ParcelOrder, "id">),
    id,
    sellerPhotos: Array.isArray(data.sellerPhotos) ? data.sellerPhotos : [],
    items: Array.isArray(data.items) ? data.items : []
  };
}

/** ลบ key ที่เป็น undefined — Firestore ปฏิเสธทั้ง doc ถ้ามีตัวเดียว */
function clean<T extends Record<string, unknown>>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** ออเดอร์ที่ยังไม่จบทั้งหมด + ที่จบแล้วในช่วง recentDays ล่าสุด */
export async function listParcelOrders(opts: { branch?: string; recentDays?: number } = {}): Promise<ParcelOrder[]> {
  const snap = await col().get();
  const today = bangkokDate(new Date());
  const cutoff = new Date(Date.now() - (opts.recentDays ?? 30) * 86_400_000).toISOString();
  return snap.docs
    .map((doc) => fromDoc(doc.id, doc.data()))
    .filter((order) => !opts.branch || order.branch === opts.branch)
    .filter((order) => {
      const finished = order.cancelled || (order.processedAt && !(order.problems || []).some((p) => !p.resolvedAt));
      if (!finished) return true;
      const at = order.cancelledAt || order.processedAt || order.createdAt;
      return at >= cutoff || order.orderedDate >= today;
    });
}

/** ทุกออเดอร์ (ใช้คิด KPI ย้อนหลัง) */
export async function listAllParcelOrders(): Promise<ParcelOrder[]> {
  const snap = await col().get();
  return snap.docs.map((doc) => fromDoc(doc.id, doc.data()));
}

export type ParcelCreateInput = {
  branch?: unknown;
  seller?: unknown;
  sellerLink?: unknown;
  orderedDate?: unknown;
  totalPaid?: unknown;
  trackingNumber?: unknown;
  note?: unknown;
  sellerPhotos?: unknown;
  items?: unknown;
};

function validBranch(value: unknown): string {
  return typeof value === "string" && allBranchKeys().includes(value) ? value : "bangkae";
}

export async function createParcelOrder(input: ParcelCreateInput, by: string): Promise<{ id?: string; error?: string }> {
  const seller = cleanParcelText(input.seller, 120);
  if (!seller) return { error: "ใส่ชื่อร้าน/พ่อค้าก่อน" };
  const orderedDate = isIsoDate(input.orderedDate) ? input.orderedDate : bangkokDate(new Date());
  const { items, error } = normaliseItems(input.items, () => randomUUID().slice(0, 8));
  if (error) return { error };
  const ref = col().doc();
  const order: Omit<ParcelOrder, "id"> = clean({
    branch: validBranch(input.branch),
    seller,
    sellerLink: cleanParcelText(input.sellerLink, 400) || undefined,
    orderedDate,
    dueDate: arrivalDueDate(orderedDate),
    totalPaid: cleanParcelNumber(input.totalPaid),
    trackingNumber: cleanParcelText(input.trackingNumber, 80) || undefined,
    note: cleanParcelText(input.note, 1000) || undefined,
    sellerPhotos: normalisePhotos(input.sellerPhotos),
    items,
    createdBy: by,
    createdAt: new Date().toISOString()
  });
  await ref.set(order);
  return { id: ref.id };
}

/**
 * แก้รายละเอียดออเดอร์ (เจ้าของร้าน). รายการการ์ดที่มี id เดิมเก็บผลเช็ค/ลงไว้ — แก้ราคา/
 * แผนได้โดยไม่ลบงานที่แอดมินทำไปแล้ว.
 */
export async function updateParcelOrder(id: string, input: ParcelCreateInput): Promise<{ error?: string }> {
  const ref = col().doc(id);
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { error: "ไม่พบออเดอร์" };
    const order = fromDoc(id, snap.data()!);
    const rawItems = Array.isArray(input.items) ? input.items : [];
    const { items, error } = normaliseItems(rawItems, (index) => {
      const given = (rawItems[index] as { id?: unknown })?.id;
      return typeof given === "string" && given ? given.slice(0, 40) : randomUUID().slice(0, 8);
    });
    if (error) return { error };
    const previous = new Map(order.items.map((item) => [item.id, item]));
    const merged = items.map((item) => {
      const old = previous.get(item.id);
      if (!old) return item;
      return {
        ...item,
        check: old.check,
        checkNote: old.checkNote,
        checkedBy: old.checkedBy,
        checkedAt: old.checkedAt,
        storedBy: old.storedBy,
        storedAt: old.storedAt
      };
    });
    const seller = cleanParcelText(input.seller, 120) || order.seller;
    const orderedDate = isIsoDate(input.orderedDate) ? input.orderedDate : order.orderedDate;
    const next: ParcelOrder = {
      ...order,
      branch: validBranch(input.branch ?? order.branch),
      seller,
      sellerLink: cleanParcelText(input.sellerLink, 400) || undefined,
      orderedDate,
      dueDate: arrivalDueDate(orderedDate),
      totalPaid: cleanParcelNumber(input.totalPaid),
      trackingNumber: cleanParcelText(input.trackingNumber, 80) || undefined,
      note: cleanParcelText(input.note, 1000) || undefined,
      sellerPhotos: input.sellerPhotos === undefined ? order.sellerPhotos : normalisePhotos(input.sellerPhotos),
      items: merged
    };
    tx.set(ref, clean(withProcessed(next, new Date())));
    return {};
  });
}

/** ตั้ง/ล้าง processedDate ตามว่าทุกรายการถูกจัดการครบหรือยัง */
function withProcessed(order: ParcelOrder, now: Date): ParcelOrder {
  if (!order.arrivedDate) return { ...order, processedAt: undefined, processedDate: undefined };
  const done = allItemsHandled(order);
  if (done && !order.processedDate) {
    return { ...order, processedAt: now.toISOString(), processedDate: bangkokDate(now) };
  }
  if (!done && order.processedDate) return { ...order, processedAt: undefined, processedDate: undefined };
  return order;
}

async function mutate(
  id: string,
  change: (order: ParcelOrder, now: Date) => ParcelOrder | { error: string }
): Promise<{ error?: string; order?: ParcelOrder }> {
  const ref = col().doc(id);
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { error: "ไม่พบออเดอร์" };
    const now = new Date();
    const result = change(fromDoc(id, snap.data()!), now);
    if ("error" in result) return { error: result.error };
    const next = withProcessed(result, now);
    const { id: _ignored, ...data } = next;
    tx.set(ref, clean(data));
    return { order: next };
  });
}

// ── วิดีโอแกะกล่อง ───────────────────────────────────────────────────────────
// วิดีโอใหญ่เกินกว่าจะผ่าน serverless function (Vercel จำกัด body ~4.5MB) → server เปิด
// resumable upload session ด้วย service account แล้วให้เบราว์เซอร์ PUT ไฟล์ตรงเข้า Storage.
// ไม่พึ่ง Firebase Auth ฝั่ง client (INVARIANTS §7) — สิทธิ์มาจาก session SOP ตอนขอ session URL.

export async function createVideoUploadSession(
  orderId: string,
  contentType: string,
  size: number,
  origin: string
): Promise<{ uploadUrl?: string; path?: string; error?: string }> {
  if (!contentType.startsWith("video/")) return { error: "ไฟล์ต้องเป็นวิดีโอ" };
  if (!Number.isFinite(size) || size <= 0) return { error: "ไฟล์ว่าง" };
  if (size > MAX_VIDEO_BYTES) return { error: "วิดีโอใหญ่เกิน 600MB — ถ่ายที่ 1080p หรือตัดให้สั้นลง" };
  const snap = await col().doc(orderId).get();
  if (!snap.exists) return { error: "ไม่พบออเดอร์" };
  const ext = (contentType.split("/")[1] || "mp4").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "mp4";
  const path = `${VIDEO_PREFIX}/${orderId}/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
  const [uploadUrl] = await adminBucket()
    .file(path)
    .createResumableUpload({
      origin,
      metadata: {
        contentType,
        metadata: { firebaseStorageDownloadTokens: randomUUID(), orderId }
      }
    });
  return { uploadUrl, path };
}

async function videoUrlFor(orderId: string, path: string): Promise<string | null> {
  if (!path.startsWith(`${VIDEO_PREFIX}/${orderId}/`) || path.includes("..")) return null;
  const file = adminBucket().file(path);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [meta] = await file.getMetadata();
  const token = String((meta.metadata as Record<string, unknown> | undefined)?.firebaseStorageDownloadTokens || "");
  if (!token || !String(meta.contentType || "").startsWith("video/")) return null;
  return `https://firebasestorage.googleapis.com/v0/b/${adminStorageBucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

/** แอดมินรับพัสดุ = อัปวิดีโอแกะกล่องเสร็จ */
export async function markArrivedWithVideo(id: string, path: string, by: string) {
  const url = await videoUrlFor(id, path);
  if (!url) return { error: "ไม่พบวิดีโอที่อัปโหลด ลองอัปใหม่อีกครั้ง" };
  return mutate(id, (order, now) => {
    if (order.cancelled) return { error: "ออเดอร์นี้ยกเลิกแล้ว" };
    return {
      ...order,
      unboxVideoUrl: url,
      arrivedDate: order.arrivedDate || bangkokDate(now),
      arrivedAt: order.arrivedAt || now.toISOString(),
      arrivedBy: order.arrivedBy || by
    };
  });
}

/** เจ้าของร้านบันทึกว่าถึงร้านแล้ว (เช่น เช็คเลขพัสดุว่าส่งถึงแล้ว) — เริ่มนับเดดไลน์ฝั่งแอดมิน */
export async function markArrivedByOwner(id: string, arrivedDate: string, by: string) {
  if (!isIsoDate(arrivedDate)) return { error: "วันที่ไม่ถูกต้อง" };
  return mutate(id, (order, now) => {
    if (arrivedDate > bangkokDate(now)) return { error: "วันที่ถึงร้านต้องไม่เกินวันนี้" };
    return { ...order, arrivedDate, arrivedAt: order.arrivedAt || now.toISOString(), arrivedBy: order.arrivedBy || by };
  });
}

export async function checkItem(id: string, itemId: string, check: ParcelCheck | null, note: string, by: string) {
  return mutate(id, (order, now) => {
    if (!order.arrivedDate) return { error: "อัปวิดีโอแกะกล่องก่อน แล้วค่อยเช็คของ" };
    const item = order.items.find((entry) => entry.id === itemId);
    if (!item) return { error: "ไม่พบรายการ" };
    if (check && check !== "ok" && !note.trim()) return { error: "บอกด้วยว่าไม่ตรงยังไง" };
    const at = now.toISOString();
    const problems = [...(order.problems || [])];
    // ปัญหาเดิมของรายการนี้ที่ยังเปิดอยู่ — เช็คใหม่แล้วถือว่าข้อมูลเดิมไม่ใช้แล้ว
    for (const [index, problem] of problems.entries()) {
      if (problem.itemId === itemId && !problem.resolvedAt) {
        problems[index] = { ...problem, resolvedAt: at, resolvedBy: by, resolution: "แอดมินเช็คใหม่" };
      }
    }
    const nextItem: ParcelItem = check
      ? { ...item, check, checkNote: note.trim() || undefined, checkedBy: by, checkedAt: at }
      : { ...item, check: undefined, checkNote: undefined, checkedBy: undefined, checkedAt: undefined };
    if (check !== "ok") {
      nextItem.storedAt = undefined;
      nextItem.storedBy = undefined;
    }
    if (check && check !== "ok") {
      problems.push({
        itemId,
        note: `${item.name}: ${check === "missing" ? "ไม่มีในกล่อง" : "ไม่ตรง"} — ${note.trim()}`,
        by,
        at
      });
    }
    return { ...order, problems, items: order.items.map((entry) => (entry.id === itemId ? nextItem : entry)) };
  });
}

export async function storeItem(id: string, itemId: string, stored: boolean, by: string) {
  return mutate(id, (order, now) => {
    const item = order.items.find((entry) => entry.id === itemId);
    if (!item) return { error: "ไม่พบรายการ" };
    if (stored && item.check !== "ok") return { error: "กดว่า \"ตรง\" ก่อน แล้วค่อยลง" };
    const nextItem: ParcelItem = stored
      ? { ...item, storedAt: now.toISOString(), storedBy: by }
      : { ...item, storedAt: undefined, storedBy: undefined };
    return { ...order, items: order.items.map((entry) => (entry.id === itemId ? nextItem : entry)) };
  });
}

export async function reportProblem(id: string, note: string, by: string) {
  const text = note.trim().slice(0, 500);
  if (!text) return { error: "พิมพ์รายละเอียดปัญหาก่อน" };
  return mutate(id, (order, now) => ({
    ...order,
    problems: [...(order.problems || []), { note: text, by, at: now.toISOString() }]
  }));
}

export async function resolveProblem(id: string, index: number, resolution: string, by: string) {
  return mutate(id, (order, now) => {
    const problems = [...(order.problems || [])];
    const problem = problems[index];
    if (!problem || problem.resolvedAt) return { error: "ไม่พบปัญหานี้ หรือปิดไปแล้ว" };
    problems[index] = { ...problem, resolvedAt: now.toISOString(), resolvedBy: by, resolution: resolution.trim().slice(0, 300) || "จัดการแล้ว" };
    return { ...order, problems };
  });
}

export async function cancelParcelOrder(id: string, cancelled: boolean, by: string) {
  return mutate(id, (order, now) =>
    cancelled
      ? { ...order, cancelled: true, cancelledBy: by, cancelledAt: now.toISOString() }
      : { ...order, cancelled: undefined, cancelledBy: undefined, cancelledAt: undefined }
  );
}

// ── แจ้งเตือนเจ้าของร้าน (Telegram ผ่าน Vera) ────────────────────────────────

export async function notifyOwner(message: string, source = "sop-parcel"): Promise<void> {
  await adminDb().collection(NOTIFY_COLLECTION).add({
    message,
    status: "pending",
    source,
    createdAt: FieldValue.serverTimestamp()
  });
}

/** รอบเช้า/เย็น: ส่งสรุปออเดอร์ที่ต้องตามให้แชมป์ วันละครั้งต่อออเดอร์ */
export async function sendOwnerParcelAlerts(now = new Date()): Promise<{ sent: number }> {
  const today = bangkokDate(now);
  const orders = await listAllParcelOrders();
  const due = parcelsNeedingOwnerAlert(orders, today);
  if (!due.length) return { sent: 0 };
  await notifyOwner(ownerAlertMessage(due, today));
  const batch = adminDb().batch();
  for (const order of due) batch.update(col().doc(order.id), { ownerAlertedOn: today });
  await batch.commit();
  return { sent: due.length };
}

export function problemAlertText(order: ParcelOrder, problem: ParcelProblem): string {
  return [
    "พัสดุการ์ด - แอดมินแจ้งของไม่ตรง",
    `ร้าน: ${order.seller}`.replace(/[[\]*_`]/g, " "),
    problem.note.replace(/[[\]*_`]/g, " "),
    "https://sop.uplevelguild.com/parcels"
  ].join("\n");
}

// ── KPI: ใครเข้ากะสาขาไหนจริงวันไหน ───────────────────────────────────────────

type ShiftDoc = { branch?: string; workDate?: string; staffCode?: string; assignment?: string; updatedAt?: string };
type ActualDoc = { workDate?: string; staffCode?: string; clockIn?: string; swappedTo?: string };

/**
 * key `${staffCode}:${workDate}:${branch}` = มีกะทำงาน (s1/s2) ที่สาขานั้น และตอกบัตรเข้าวันนั้น.
 * อ่านไม่ได้ → เซ็ตว่าง = ไม่หัก (ปลอดภัยกว่าหักผิด).
 */
export async function fetchWorkedAtBranch(): Promise<Set<string>> {
  try {
    const [shifts, actuals] = await Promise.all([
      restListCollection<ShiftDoc>("schedule_shifts"),
      restListCollection<ActualDoc>("schedule_actual")
    ]);
    const clockedIn = new Set<string>();
    const swapped = new Set<string>();
    for (const actual of actuals) {
      if (!actual.workDate || !actual.staffCode) continue;
      if (actual.clockIn) clockedIn.add(`${actual.staffCode}:${actual.workDate}`);
      if (actual.swappedTo) swapped.add(`${actual.staffCode}:${actual.workDate}`);
    }
    const worked = new Set<string>();
    for (const shift of onePerStaffDay(shifts)) {
      if (!shift.workDate || !shift.staffCode) continue;
      if (shift.assignment !== "s1" && shift.assignment !== "s2") continue;
      const key = `${shift.staffCode}:${shift.workDate}`;
      if (swapped.has(key) || !clockedIn.has(key)) continue;
      worked.add(`${key}:${shift.branch || "bangkae"}`);
    }
    return worked;
  } catch {
    return new Set<string>();
  }
}
