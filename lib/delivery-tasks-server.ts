import "server-only";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import { isWorkingAssignment, type ShiftAssignment, type ShiftCode } from "./shift-schedule.ts";
import {
  addWorkDays,
  bangkokWorkDate,
  buildShiftWindows,
  deliveryTargetsFor,
  nextShiftTargetFor,
  DELIVERY_DUE_DAYS,
  type DeliveryTask,
  type ShiftWindows
} from "./delivery-tasks.ts";

// อ่านออเดอร์ที่จ่ายเงินแล้วจากเว็บกิลด์ (Firestore `shop-orders` โปรเจกต์ up-level-guild
// ตัวเดียวกับ SOP) แล้วสร้างใบงานส่งของใน `delivery_tasks` ให้เด้งบน Dashboard ของกะ
// ที่รับผิดชอบ — กติกาการเลือกกะอยู่ใน lib/delivery-tasks.ts.
//
// เจตนา 3 อย่างที่ห้ามหลุด:
//  1. ไม่เขียนอะไรกลับไปที่ `shop-orders` — เว็บกิลด์เป็นเจ้าของข้อมูลนั้น สถานะฝั่งร้าน
//     (รับงาน/ส่งต่อกะ/ส่งแล้ว) เก็บใน `delivery_tasks` ของ SOP เอง
//  2. ไม่แตะ `work_assignments` — คอลเลกชันนั้นป้อน KPI ที่หักเงินเดือนจริง (INVARIANTS §5)
//     งานที่ระบบสร้างเองต้องไม่ไปโผล่ในคะแนนพนักงาน
//  3. sync สร้างใบงานเฉพาะออเดอร์ที่ยังไม่มีใบ — ห้าม overwrite สถานะที่พนักงานกดไว้แล้ว

const ORDERS = "shop-orders";
const TASKS = "delivery_tasks";
const SHIFTS = "schedule_shifts";

/** ย้อนหลังกี่วันตอน sync — กันออเดอร์ที่จ่ายช้า/webhook มาทีหลังตกหล่น */
const LOOKBACK_DAYS = 5;

/**
 * ไม่ดึงออเดอร์ที่จ่ายก่อนวันนี้ขึ้นมาเป็นงาน — วันแรกที่เปิดใช้ระบบ ไม่งั้นออเดอร์เก่า
 * ทั้งหมดจะเด้งใส่หน้ากะรวดเดียว
 */
export const DELIVERY_TRACKING_START = "2026-08-10";

/** ฟิลด์ที่ดึงจาก shop-orders — ตัด `slip` ทิ้งเพราะเป็น base64 รูปสลิปหลัก MB ต่อใบ */
const ORDER_FIELDS = [
  "status",
  "slipStatus",
  "customer",
  "items",
  "total",
  "source",
  "createdAt",
  "confirmedAt",
  "manualPaidAt",
  "product",
  "qty"
] as const;

type OrderCustomer = { name?: string; phone?: string; address?: string; note?: string };
type OrderItem = { sku?: string; name?: string; qty?: number };
type OrderDoc = {
  status?: string;
  slipStatus?: string;
  customer?: OrderCustomer;
  items?: OrderItem[];
  total?: number;
  source?: string;
  createdAt?: unknown;
  confirmedAt?: unknown;
  manualPaidAt?: unknown;
  product?: string;
  qty?: number;
};

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object" && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

/**
 * "จ่ายแล้ว" ตามนิยามเดียวกับหน้า admin ของเว็บกิลด์ (admin-online-sales.html):
 * `status === 'confirmed'` อย่างเดียวไม่พอ — ออเดอร์ที่ match ผ่าน bank-hook/satang
 * จะติดแค่ `slipStatus === 'paid'`
 */
function isPaidOrder(order: OrderDoc): boolean {
  if (order.status === "rejected") return false;
  return order.status === "confirmed" || order.slipStatus === "paid";
}

function paidAtOf(order: OrderDoc): Date | null {
  return toDate(order.confirmedAt) ?? toDate(order.manualPaidAt) ?? toDate(order.createdAt);
}

function summariseItems(order: OrderDoc): { summary: string; count: number } {
  const items = Array.isArray(order.items) ? order.items : [];
  if (!items.length) {
    // ออเดอร์ shield ไม่มี items[] — เก็บชื่อสินค้ากับจำนวนไว้แทน
    const qty = Number(order.qty) || 0;
    return order.product ? { summary: qty ? `${order.product} ×${qty}` : order.product, count: qty || 1 } : { summary: "", count: 0 };
  }
  const count = items.reduce((total, item) => total + (Number(item.qty) || 0), 0);
  const summary = items
    .slice(0, 4)
    .map((item) => `${item.name || item.sku || "สินค้า"}${Number(item.qty) > 1 ? ` ×${item.qty}` : ""}`)
    .join(", ");
  return { summary: items.length > 4 ? `${summary} …อีก ${items.length - 4} รายการ` : summary, count };
}

type ShiftCell = { staffCode: string; shift: ShiftCode; startTime?: string };

async function fetchShiftCells(branch: string, workDate: string): Promise<ShiftCell[]> {
  const snapshot = await adminDb().collection(SHIFTS).where("branch", "==", branch).where("workDate", "==", workDate).get();
  const cells: ShiftCell[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data() as { staffCode?: string; assignment?: ShiftAssignment; startTime?: string };
    if (data.staffCode && data.assignment && isWorkingAssignment(data.assignment)) {
      cells.push({ staffCode: data.staffCode, shift: data.assignment, startTime: data.startTime });
    }
  }
  return cells;
}

/** ช่วงเวลาของทุกกะในวันนั้นและวันถัดไป — ใช้ตัดสินว่า "กะปัจจุบัน/กะถัดไป" คือใคร */
export async function fetchShiftWindows(branch: string, workDate: string): Promise<ShiftWindows> {
  const nextDate = addWorkDays(workDate, 1);
  const [todayCells, tomorrowCells] = await Promise.all([
    fetchShiftCells(branch, workDate),
    fetchShiftCells(branch, nextDate)
  ]);
  return {
    today: buildShiftWindows(workDate, todayCells),
    tomorrow: buildShiftWindows(nextDate, tomorrowCells)
  };
}

/** กะที่พนักงานคนนี้ลงไว้วันนั้น (null = วันหยุด / ลา / ยังไม่ลงตาราง) */
export async function fetchShiftForStaff(branch: string, workDate: string, staffCode: string): Promise<ShiftCode | null> {
  if (!hasAdminCredentials() || !staffCode) return null;
  const snapshot = await adminDb().collection(SHIFTS).doc(`${branch}__${workDate}__${staffCode}`).get();
  if (!snapshot.exists) return null;
  const assignment = (snapshot.data() as { assignment?: ShiftAssignment }).assignment;
  return assignment && isWorkingAssignment(assignment) ? assignment : null;
}

function taskId(orderId: string): string {
  return `dt__${orderId}`;
}

/** ใบงานส่งของช่วง LOOKBACK_DAYS ล่าสุดของสาขา */
export async function fetchDeliveryTasks(branch: string, now = new Date()): Promise<DeliveryTask[]> {
  if (!hasAdminCredentials()) return [];
  const since = addWorkDays(bangkokWorkDate(now), -LOOKBACK_DAYS);
  const snapshot = await adminDb().collection(TASKS).where("paidWorkDate", ">=", since).get();
  return snapshot.docs.map((doc) => doc.data() as DeliveryTask).filter((task) => task.branch === branch);
}

/**
 * ดึงออเดอร์ที่จ่ายแล้วจากเว็บกิลด์ แล้วสร้างใบงานส่งของสำหรับใบที่ยังไม่มี.
 * คืนใบงานทั้งหมดของสาขาช่วงล่าสุด (ของเดิม + ที่เพิ่งสร้าง).
 */
export async function syncDeliveryTasks(branch: string, now = new Date()): Promise<DeliveryTask[]> {
  const existing = await fetchDeliveryTasks(branch, now);
  if (!hasAdminCredentials()) return existing;

  const known = new Set(existing.map((task) => task.orderId));
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  let orders;
  try {
    orders = await adminDb()
      .collection(ORDERS)
      .where("createdAt", ">=", since)
      .select(...ORDER_FIELDS)
      .get();
  } catch {
    // อ่านออเดอร์ไม่ได้ (สิทธิ์/index) — ยังต้องคืนใบงานที่มีอยู่ ไม่ให้หน้าจอว่างเปล่า
    return existing;
  }

  const windowsByDate = new Map<string, ShiftWindows>();
  const created: DeliveryTask[] = [];
  const nowIso = now.toISOString();

  for (const doc of orders.docs) {
    if (known.has(doc.id)) continue;
    const order = doc.data() as OrderDoc;
    if (!isPaidOrder(order)) continue;

    const paidAt = paidAtOf(order);
    if (!paidAt) continue;
    const paidWorkDate = bangkokWorkDate(paidAt);
    if (paidWorkDate < DELIVERY_TRACKING_START) continue;

    let windows = windowsByDate.get(paidWorkDate);
    if (!windows) {
      windows = await fetchShiftWindows(branch, paidWorkDate);
      windowsByDate.set(paidWorkDate, windows);
    }

    const { summary, count } = summariseItems(order);
    const customer = order.customer || {};
    const task: DeliveryTask = {
      id: taskId(doc.id),
      branch,
      orderId: doc.id,
      orderCode: doc.id.slice(-6).toUpperCase(),
      source: order.source || "web",
      customerName: customer.name || "",
      customerPhone: customer.phone || "",
      customerAddress: customer.address || "",
      itemsSummary: summary,
      itemCount: count,
      total: Number(order.total) || 0,
      paidAt: paidAt.toISOString(),
      paidWorkDate,
      dueDate: addWorkDays(paidWorkDate, DELIVERY_DUE_DAYS),
      detectedAt: nowIso,
      targets: deliveryTargetsFor(paidAt, windows),
      status: "open"
    };

    // create ไม่ใช่ merge: ถ้ามีใบอยู่แล้ว (แข่งกันเขียนจากสองแท็บ) ให้ทิ้งไป
    // ไม่งั้นสถานะที่พนักงานกดไว้จะถูกรีเซ็ตกลับเป็น open
    try {
      await adminDb().collection(TASKS).doc(task.id).create(task);
      created.push(task);
    } catch {
      // มีคนสร้างไปแล้ว — ข้าม
    }
  }

  return [...existing, ...created];
}

/** พนักงานรับงานไปแพ็ค */
export async function claimDeliveryTask(taskDocId: string, staffCode: string, now = new Date()): Promise<void> {
  await adminDb().collection(TASKS).doc(taskDocId).update({
    status: "packing",
    claimedBy: staffCode,
    claimedAt: now.toISOString()
  });
}

/**
 * "ส่งงานให้กะถัดไป" — กะปัจจุบันส่งไม่ทันรอบรถ ย้ายทั้งใบไปกะถัดไป (คำนวณ ณ เวลาที่กด)
 * แล้วปลดคนที่รับไว้ออก งานจะกลับเป็นรอคนรับของกะใหม่
 */
export async function handoffDeliveryTask(
  taskDocId: string,
  branch: string,
  staffCode: string,
  now = new Date()
): Promise<{ ok: boolean; target?: string }> {
  const windows = await fetchShiftWindows(branch, bangkokWorkDate(now));
  const target = nextShiftTargetFor(now, windows);
  if (!target) return { ok: false };
  await adminDb().collection(TASKS).doc(taskDocId).update({
    targets: [target],
    status: "open",
    claimedBy: "",
    handedOff: true,
    handedOffBy: staffCode,
    handedOffAt: now.toISOString()
  });
  return { ok: true, target };
}

/** ส่งของแล้ว — ต้องมีเลข tracking เสมอ (กติกาเดิมของหัวข้อ "จัดส่งสินค้า") */
export async function shipDeliveryTask(
  taskDocId: string,
  staffCode: string,
  trackingNumber: string,
  now = new Date()
): Promise<void> {
  await adminDb().collection(TASKS).doc(taskDocId).update({
    status: "shipped",
    trackingNumber,
    shippedBy: staffCode,
    shippedAt: now.toISOString()
  });
}
