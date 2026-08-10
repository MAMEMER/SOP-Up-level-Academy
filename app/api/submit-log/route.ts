import { NextResponse } from "next/server";
import { actor, badRequest, db, isAdmin } from "../../../lib/api-firestore.ts";

// บันทึกทุกครั้งที่พนักงานกดปุ่ม "ส่งงาน" ในหน้า checklist — แยกจากตัวงานเอง.
//
// ทำไมต้องมี: น้องบอก "กดมาแล้วแต่ไม่ขึ้น" แล้วไม่มีใครตรวจได้ว่ากดจริงไหม กลายเป็นทั้ง
// พนักงานเสียเปรียบเวลาระบบพลาดจริง และอ้างได้เวลาไม่ได้กด. log นี้เขียนตอน "กด" ไม่ใช่ตอน
// "บันทึกสำเร็จ" จึงเห็นแม้กรณีที่บันทึกงานไม่ผ่าน (`ok: false`).
//
// append-only: doc id มี timestamp ทุกครั้ง จึงไม่มีการเขียนทับ และไม่มี endpoint ให้ลบ.
// ไม่ผูกกับ KPI — เป็นหลักฐานให้คนอ่าน ไม่ใช่ตัวคิดคะแนน.

export const dynamic = "force-dynamic";
const COLLECTION = "sop_submit_log";

export async function POST(request: Request) {
  const { user, staffCode } = await actor();
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return badRequest("missing_body");

  const str = (value: unknown) => (typeof value === "string" ? value : "");
  const workDate = str(body.workDate);
  const phaseId = str(body.phaseId);
  if (!workDate || !phaseId) return badRequest("missing_params");

  // ตัวตนมาจาก session เสมอ ไม่เชื่อค่าที่ browser ส่งมา
  const receivedAt = new Date().toISOString();
  const id = `${staffCode || user.email}__${workDate}__${phaseId}__${receivedAt}`;

  try {
    await db()
      .collection(COLLECTION)
      .doc(id)
      .create({
        id,
        staffCode: staffCode || "",
        employeeEmail: user.email,
        employeeName: user.name,
        workDate,
        phaseId,
        phaseTitle: str(body.phaseTitle),
        pressedAt: str(body.pressedAt) || receivedAt,
        receivedAt,
        saved: body.ok === true,
        // การกดขณะดูแทนคนอื่น (view-as) เขียนงานไม่ได้อยู่แล้ว แต่ต้องแยกออกจากการกดจริง
        impersonating: Boolean(user.isImpersonating)
      });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "write_failed", detail: String(error) }, { status: 500 });
  }
}

/**
 * GET /api/submit-log?workDate=YYYY-MM-DD  → ประวัติการกดส่งของวันนั้น
 * เจ้าของร้านเห็นทุกคน · พนักงานเห็นเฉพาะของตัวเอง (ใช้ยืนยันว่าตัวเองกดไปแล้วจริง)
 */
export async function GET(request: Request) {
  const { user, staffCode } = await actor();
  const params = new URL(request.url).searchParams;
  const workDate = params.get("workDate") || "";
  if (!workDate) return badRequest("missing_workDate");

  try {
    let query = db().collection(COLLECTION).where("workDate", "==", workDate);
    if (!isAdmin(user)) query = query.where("employeeEmail", "==", user.email);
    const snapshot = await query.get();
    const entries = snapshot.docs
      .map((doc) => doc.data())
      .sort((left, right) => String(left.receivedAt).localeCompare(String(right.receivedAt)));
    return NextResponse.json({ entries, staffCode });
  } catch (error) {
    return NextResponse.json({ error: "read_failed", detail: String(error) }, { status: 500 });
  }
}
