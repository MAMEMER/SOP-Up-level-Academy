import { NextResponse } from "next/server";
import { actor, badRequest, canWriteNow, isAdmin, readOnly } from "../../../lib/api-firestore.ts";
import {
  claimDeliveryTask,
  fetchShiftForStaff,
  handoffDeliveryTask,
  shipDeliveryTask,
  syncDeliveryTasks
} from "../../../lib/delivery-tasks-server.ts";
import { bangkokWorkDate, deliveryTaskVisibleTo, sortDeliveryTasks } from "../../../lib/delivery-tasks.ts";

// งานส่งของจากออเดอร์เว็บกิลด์. GET จะ sync ออเดอร์ที่จ่ายแล้วเป็นใบงานก่อนเสมอ แล้วคืน
// เฉพาะใบที่คนดูควรเห็น (กะตัวเองวันนี้ / งานที่ตัวเองรับไว้ / เจ้าของร้านเห็นหมด).
// การกระทำ (รับงาน / ส่งต่อกะถัดไป / ส่งแล้ว) เปิดให้ staff ที่ล็อกอินทุกคน เหมือนหน้า
// งานส่งต่อ (work_handoffs) — งานหน้าร้านต้องหยิบแทนกันได้เมื่อคนเดิมไม่อยู่.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user, staffCode } = await actor();
  const branch = new URL(request.url).searchParams.get("branch") || "bangkae";
  const now = new Date();
  const today = bangkokWorkDate(now);

  try {
    const [tasks, shiftToday] = await Promise.all([
      syncDeliveryTasks(branch, now),
      staffCode ? fetchShiftForStaff(branch, today, staffCode) : Promise.resolve(null)
    ]);
    const viewer = { isAdmin: isAdmin(user), staffCode: staffCode || null, shiftToday, today };
    const visible = sortDeliveryTasks(
      tasks.filter((task) => deliveryTaskVisibleTo(task, viewer)),
      today
    );
    return NextResponse.json({ tasks: visible, today, shiftToday, isAdmin: viewer.isAdmin, staffCode });
  } catch (error) {
    return NextResponse.json({ error: "read_failed", detail: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { user, staffCode } = await actor();
  if (!canWriteNow(user)) return readOnly();

  const body = (await request.json().catch(() => null)) as { action?: string; [k: string]: unknown } | null;
  if (!body || typeof body.action !== "string") return badRequest("missing_action");
  const str = (value: unknown) => (typeof value === "string" ? value : "");
  const id = str(body.id);
  if (!id) return badRequest("missing_id");
  // doc id เป็น segment เดียวเสมอ — กัน id ที่มี "/" พาไปเขียน subcollection ที่ไม่ตั้งใจ
  if (id.includes("/")) return badRequest("bad_id");
  const acting = staffCode || user.actualEmail;

  try {
    switch (body.action) {
      case "claimDelivery": {
        await claimDeliveryTask(id, acting);
        return NextResponse.json({ ok: true });
      }
      case "handoffDelivery": {
        const branch = str(body.branch) || "bangkae";
        const result = await handoffDeliveryTask(id, branch, acting);
        return NextResponse.json({ ok: true, targets: result.targets });
      }
      case "shipDelivery": {
        const trackingNumber = str(body.trackingNumber).trim();
        if (!trackingNumber) return badRequest("ต้องกรอกเลข tracking ก่อนปิดงานส่งของ");
        await shipDeliveryTask(id, acting, trackingNumber);
        return NextResponse.json({ ok: true });
      }
      default:
        return badRequest("unknown_action");
    }
  } catch (error) {
    return NextResponse.json({ error: "write_failed", detail: String(error) }, { status: 500 });
  }
}
