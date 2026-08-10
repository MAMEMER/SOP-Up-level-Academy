import "server-only";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import { buildAdminNotifications, type AdminNotification, type NotificationInput } from "./admin-notifications.ts";
import { deliveryTaskState, type DeliveryTask } from "./delivery-tasks.ts";
import { syncDeliveryTasks } from "./delivery-tasks-server.ts";
import { restListCollection } from "./firestore-rest.ts";
import { dailyScopeKey } from "./work-records.ts";
import { listRecordsForScopeKey } from "./work-records-store.ts";
import type { OpsSummary } from "./ops-summary.ts";
import type { WorkflowDailyRecord, WorkflowDayPayload } from "./workflow-records.ts";

// รวบรวมตัวเลขให้ศูนย์รวมแจ้งเตือนบน Admin Hub. อ่านจากหลายที่ ทุกตัวห่อ safe() ไว้ —
// แหล่งใดแหล่งหนึ่งล่มต้องไม่ทำให้ทั้งหน้าพัง เพราะหน้านี้คือหน้าแรกที่เจ้าของร้านเปิด.

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

/** งาน checklist ที่พนักงานกดส่ง แต่ไม่มี record ในระบบ = ระบบพลาด ไม่ใช่พนักงานไม่ทำ */
async function pressesWithoutRecord(workDate: string): Promise<Array<{ staffName: string; phaseTitle: string }>> {
  if (!hasAdminCredentials()) return [];

  const [logSnapshot, dayDocs] = await Promise.all([
    adminDb().collection("sop_submit_log").where("workDate", "==", workDate).get(),
    listRecordsForScopeKey(dailyScopeKey(workDate))
  ]);

  const recorded = new Set<string>();
  for (const doc of dayDocs) {
    const records = (doc.data as Partial<WorkflowDayPayload> | undefined)?.records || [];
    for (const record of records as WorkflowDailyRecord[]) {
      recorded.add(`${doc.employeeEmail}:${record.phaseId}`);
    }
  }

  return logSnapshot.docs
    .map((doc) => doc.data() as { employeeEmail?: string; employeeName?: string; phaseId?: string; phaseTitle?: string; impersonating?: boolean })
    // การกดตอนดูแทนคนอื่น (view-as) เขียนงานไม่ได้อยู่แล้ว ไม่ใช่ความผิดพลาดของระบบ
    .filter((entry) => !entry.impersonating && entry.employeeEmail && entry.phaseId)
    .filter((entry) => !recorded.has(`${entry.employeeEmail}:${entry.phaseId}`))
    .map((entry) => ({ staffName: entry.employeeName || entry.employeeEmail || "", phaseTitle: entry.phaseTitle || entry.phaseId || "" }));
}

async function openTicketCount(): Promise<number> {
  if (!hasAdminCredentials()) return 0;
  // กรอง source ในหน่วยความจำ เพื่อไม่ต้องสร้าง composite index สำหรับ collection เล็กๆ
  const snapshot = await adminDb().collection("tickets").where("status", "==", "open").get();
  return snapshot.docs.filter((doc) => (doc.data() as { source?: string }).source === "sop").length;
}

/**
 * นับงานค้างในเว็บกิลด์ (โปรเจกต์ Firebase เดียวกัน อ่านตรงด้วย adminDb() ได้เลย).
 * ใช้ aggregate .count() ทุกหมวด — ได้แค่ตัวเลข ไม่ดึงตัว document ลงมา จึงไม่แตะฟิลด์
 * slip ของ shop_orders (เป็น base64 รูปหลาย MB) และไม่เปิด users ทั้ง collection.
 * ⚠️ shop_orders (ขีดล่าง) = ร้านค้าในเว็บกิลด์ คนละอันกับ shop-orders (ขีดกลาง) ของ SOP.
 */
async function countWhereEq(collection: string, field: string, value: string): Promise<number> {
  const snapshot = await adminDb().collection(collection).where(field, "==", value).count().get();
  return snapshot.data().count;
}

async function countWhereIn(collection: string, field: string, values: string[]): Promise<number> {
  const snapshot = await adminDb().collection(collection).where(field, "in", values).count().get();
  return snapshot.data().count;
}

async function guildCounts(): Promise<NotificationInput["guild"]> {
  const empty: NotificationInput["guild"] = {
    expClaims: 0,
    questSubmissions: 0,
    shopRequests: 0,
    coinTopups: 0,
    mergeRequests: 0,
    guildShopOrders: 0,
    pendingMembers: 0
  };
  if (!hasAdminCredentials()) return empty;

  // ห่อ safe() ทีละหมวด — หมวดใดพัง (เช่นยังไม่มี collection) ต้องไม่ทำให้ทั้งหน้าพัง
  const [
    expClaims,
    questSubmissions,
    shopRequests,
    coinTopups,
    mergeRequests,
    guildShopOrders,
    pendingMembers
  ] = await Promise.all([
    safe(() => countWhereEq("activity_claims", "status", "pending"), 0),
    safe(() => countWhereEq("quest_submissions", "status", "pending"), 0),
    safe(() => countWhereEq("shop_requests", "status", "pending"), 0),
    safe(() => countWhereEq("coin_topups", "status", "pending_manual"), 0),
    safe(() => countWhereEq("merge_requests", "status", "pending"), 0),
    safe(() => countWhereIn("shop_orders", "status", ["pending", "processing"]), 0),
    safe(() => countWhereEq("users", "status", "pending_manual"), 0)
  ]);

  return { expClaims, questSubmissions, shopRequests, coinTopups, mergeRequests, guildShopOrders, pendingMembers };
}

function deliveryCounts(tasks: DeliveryTask[], today: string): NotificationInput["deliveries"] {
  const unshippedTasks = tasks.filter((task) => task.status !== "shipped");
  return {
    overdue: unshippedTasks.filter((task) => deliveryTaskState(task, today) === "overdue").length,
    unshipped: unshippedTasks.length,
    unclaimed: unshippedTasks.filter((task) => !task.claimedBy).length
  };
}

type AssignmentRow = { branch?: string; workDate?: string; status?: string };

/**
 * งานที่มอบหมายต้องนับข้ามวัน — `getOpsSummary` อ่านเฉพาะ workDate ของวันนี้ ใบที่เลย
 * กำหนดมาจากวันก่อนจึงไม่เคยโผล่ ซึ่งเป็นใบที่ต้องตามที่สุด
 */
async function assignmentCounts(branch: string, today: string): Promise<NotificationInput["assignments"]> {
  const rows = await restListCollection<AssignmentRow>("work_assignments");
  const mine = rows.filter((row) => row.branch === branch);
  return {
    waitingReview: mine.filter((row) => row.status === "submitted").length,
    overdue: mine.filter(
      (row) => (row.status === "open" || row.status === "needs_revision") && (row.workDate ?? "") < today
    ).length
  };
}

/**
 * ทุกเรื่องที่เจ้าของร้านต้องดูวันนี้ รวมมาเป็นรายการเดียว.
 * `summary` ส่งเข้ามาจากหน้า admin ที่เรียก getOpsSummary อยู่แล้ว — จะได้ไม่อ่านซ้ำ.
 */
export async function getAdminNotifications(
  summary: OpsSummary,
  workDate: string,
  branch = "bangkae"
): Promise<AdminNotification[]> {
  const [deliveries, lostPresses, tickets, assignments, guild] = await Promise.all([
    safe(() => syncDeliveryTasks(branch), [] as DeliveryTask[]),
    safe(() => pressesWithoutRecord(workDate), [] as Array<{ staffName: string; phaseTitle: string }>),
    safe(() => openTicketCount(), 0),
    safe(() => assignmentCounts(branch, workDate), { waitingReview: 0, overdue: 0 }),
    safe(() => guildCounts(), {
      expClaims: 0,
      questSubmissions: 0,
      shopRequests: 0,
      coinTopups: 0,
      mergeRequests: 0,
      guildShopOrders: 0,
      pendingMembers: 0
    })
  ]);

  return buildAdminNotifications({
    storageReady: summary.storageReady,
    deliveries: deliveryCounts(deliveries, workDate),
    pressesWithoutRecord: lostPresses,
    assignments,
    handoffs: { open: summary.handoffs.filter((item) => item.status === "open").length },
    checklist: { latePhases: summary.daily.latePhases, notStartedStaff: summary.noRecordStaff },
    bugReports: { open: tickets },
    guild
  });
}
