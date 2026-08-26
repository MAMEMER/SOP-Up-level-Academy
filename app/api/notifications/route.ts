import { NextResponse } from "next/server";
import { actor, badRequest, canWriteNow, db, readOnly } from "../../../lib/api-firestore.ts";
import { hasAdminCredentials } from "../../../lib/firebase-admin.ts";
import { branchFor } from "../../../lib/employee-directory.ts";
import { formatWorkDate } from "../../../lib/workflow-records.ts";
import { fetchDeliveryTasks } from "../../../lib/delivery-tasks-server.ts";
import { NOTIFICATION_READS_COLLECTION, buildStaffNotifications } from "../../../lib/staff-notifications.ts";
import { WORK_PROJECTS_COLLECTION } from "../../../lib/work-projects.ts";
import { COACHING_NOTES_COLLECTION } from "../../../lib/coaching-notes.ts";
import { STAFF_FEEDBACK_COLLECTION, visibleForStaff, type StaffFeedback } from "../../../lib/staff-feedback.ts";

// แจ้งเตือนของพนักงาน — งานใหม่ · งานส่งต่อ · งานส่งของ · คำแนะนำหัวหน้า · เสียงจากลูกค้า
// รวมไว้ที่เดียว. คิดสดจากข้อมูลจริงทุกครั้ง ไม่มีคอลเลกชันแจ้งเตือนคู่ขนานให้ค้าง.
// เห็นได้เฉพาะของตัวเองเสมอ — staffCode มาจาก session ไม่ใช่จาก query.

export const dynamic = "force-dynamic";

const ASSIGNMENTS = "work_assignments";

export async function GET() {
  const { staffCode } = await actor();
  if (!staffCode || !hasAdminCredentials()) return NextResponse.json({ notifications: [], staffCode: staffCode || null });

  const branch = branchFor(staffCode) || "bangkae";
  try {
    const [assignmentSnap, projectSnap, coachingSnap, feedbackSnap, readSnap, deliveries] = await Promise.all([
      db().collection(ASSIGNMENTS).where("staffCode", "==", staffCode).get(),
      db().collection(WORK_PROJECTS_COLLECTION).where("assignees", "array-contains", staffCode).get(),
      db().collection(COACHING_NOTES_COLLECTION).where("staffCode", "==", staffCode).get(),
      db().collection(STAFF_FEEDBACK_COLLECTION).where("staffCode", "==", staffCode).get(),
      db().collection(NOTIFICATION_READS_COLLECTION).doc(staffCode).get(),
      fetchDeliveryTasks(branch).catch(() => [])
    ]);

    const lastSeenAt = readSnap.exists ? String((readSnap.data() as { lastSeenAt?: string }).lastSeenAt || "") : "";
    const feedback = visibleForStaff(feedbackSnap.docs.map((doc) => doc.data() as StaffFeedback), staffCode).map((item) => ({
      id: item.id,
      kind: item.kind,
      message: item.message,
      createdAt: item.createdAt
    }));

    const notifications = buildStaffNotifications({
      staffCode,
      lastSeenAt,
      assignments: assignmentSnap.docs.map((doc) => doc.data() as never),
      projects: projectSnap.docs.map((doc) => doc.data() as never),
      // งานส่งของที่ยังไม่ปิดของสาขานี้ — ใบงานเป็นของ "กะ" ไม่ใช่ของคนใดคนหนึ่ง
      deliveries: deliveries.map((task) => ({
        id: task.id,
        title: `${task.orderCode} · ${task.customerName}`,
        at: task.paidAt,
        status: task.status
      })),
      coaching: coachingSnap.docs.map((doc) => doc.data() as never),
      feedback
    });
    return NextResponse.json({ notifications, staffCode });
  } catch (error) {
    return NextResponse.json({ error: "read_failed", detail: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { user, staffCode } = await actor();
  if (!canWriteNow(user)) return readOnly();
  if (!staffCode) return badRequest("no_staff_code");
  if (!hasAdminCredentials()) return NextResponse.json({ ok: false });

  const body = (await request.json().catch(() => null)) as { action?: string } | null;
  if (body?.action !== "markSeen") return badRequest("unknown_action");

  // เปิดหน้าแจ้งเตือน = อ่านทุกอย่างถึงตอนนี้ (คำแนะนำหัวหน้ายังต้องกด "รับทราบ" แยก)
  await db()
    .collection(NOTIFICATION_READS_COLLECTION)
    .doc(staffCode)
    .set({ staffCode, lastSeenAt: new Date().toISOString() }, { merge: true });
  return NextResponse.json({ ok: true });
}
