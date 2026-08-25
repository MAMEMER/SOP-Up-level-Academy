import { NextResponse } from "next/server";
import { actor, badRequest, canWriteNow, db, forbidden, isAdmin, readOnly } from "../../../lib/api-firestore.ts";
import { hasAdminCredentials } from "../../../lib/firebase-admin.ts";
import {
  STAFF_FEEDBACK_COLLECTION,
  allForAdmin,
  visibleForStaff,
  type StaffFeedback
} from "../../../lib/staff-feedback.ts";

// เสียงจากสมาชิกถึงพนักงาน — ฝั่งอ่าน/คัดกรองของเว็บ SOP (สมาชิกส่งจากเว็บกิลด์).
//  - พนักงาน: เห็นเฉพาะของตัวเอง เฉพาะที่ถูกเปิดให้เห็นแล้ว และ **ไม่มีชื่อผู้ส่ง**
//  - หัวหน้า: เห็นทั้งหมดของคนที่เลือกดู รวมชื่อผู้ส่ง เพื่อตรวจสอบย้อนได้
//  - หัวหน้าเท่านั้นที่กด "ให้พนักงานเห็น" / "ซ่อน" ได้ และห้ามกดระหว่าง "ดูเป็นคนนี้"
// ไม่มี endpoint ไหนแตะคะแนน KPI.

export const dynamic = "force-dynamic";

const str = (v: unknown) => (typeof v === "string" ? v : "");
const docId = (v: unknown) => {
  const value = str(v).trim();
  return value && !value.includes("/") ? value : "";
};

export async function GET(request: Request) {
  const { user, staffCode } = await actor();
  const requested = str(new URL(request.url).searchParams.get("staffCode")).trim();
  const admin = isAdmin(user);
  const target = admin ? requested || staffCode : staffCode;
  if (!target || !hasAdminCredentials()) return NextResponse.json({ feedback: [], isAdminView: admin });

  try {
    const snap = await db().collection(STAFF_FEEDBACK_COLLECTION).where("staffCode", "==", target).get();
    const rows = snap.docs.map((doc) => doc.data() as StaffFeedback);
    // ฝั่งพนักงานตัดชื่อผู้ส่งทิ้งที่ server — ไม่ส่งข้ามสายไปให้ client เลือกซ่อนเอง
    return NextResponse.json(
      admin ? { feedback: allForAdmin(rows, target), isAdminView: true } : { feedback: visibleForStaff(rows, target), isAdminView: false }
    );
  } catch (error) {
    return NextResponse.json({ error: "read_failed", detail: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { user } = await actor();
  if (!canWriteNow(user)) return readOnly();
  if (!isAdmin(user)) return forbidden();
  if (!hasAdminCredentials()) return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { action?: string; [k: string]: unknown } | null;
  if (!body || typeof body.action !== "string") return badRequest("missing_action");
  const id = docId(body.id);
  if (!id) return badRequest("missing_id");
  const nowIso = new Date().toISOString();
  const ref = db().collection(STAFF_FEEDBACK_COLLECTION).doc(id);

  try {
    switch (body.action) {
      // หัวหน้าเปิด/ปิดการมองเห็นของพนักงาน (คำติที่อ่านแล้วเห็นว่าสร้างสรรค์ ก็ส่งต่อได้)
      case "setVisible": {
        const visible = body.visible === true;
        const snap = await ref.get();
        if (!snap.exists) return badRequest("not_found");
        await ref.update({
          visibleToStaff: visible,
          reviewedBy: user.actualEmail,
          reviewedAt: nowIso,
          ...(visible ? { hidden: false } : {})
        });
        return NextResponse.json({ ok: true });
      }
      // สแปม/ไม่เกี่ยวกับงาน — ซ่อนถาวร ไม่ลบทิ้งเพื่อให้ตรวจย้อนได้
      case "hide": {
        const snap = await ref.get();
        if (!snap.exists) return badRequest("not_found");
        await ref.update({ hidden: true, visibleToStaff: false, reviewedBy: user.actualEmail, reviewedAt: nowIso });
        return NextResponse.json({ ok: true });
      }
      default:
        return badRequest("unknown_action");
    }
  } catch (error) {
    return NextResponse.json({ error: "write_failed", detail: String(error) }, { status: 500 });
  }
}
