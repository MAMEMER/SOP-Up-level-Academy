import { NextResponse } from "next/server";
import { actor, badRequest, canWriteNow, db, readOnly } from "../../../lib/api-firestore.ts";
import { hasAdminCredentials } from "../../../lib/firebase-admin.ts";
import { machineAuthError } from "../../../lib/clip-briefs-server.ts";
import { CLIP_BRIEFS_COLLECTION, buildClipBriefDoc, resolveSince, validateClipBrief } from "../../../lib/clip-briefs.ts";

// บรีฟคลิปก่อนตัดอัตโนมัติ
//  - POST (พนักงาน, session): ส่งบรีฟของโฟลเดอร์ Footage/<หัวข้อ>
//  - GET  (Mac mini, x-autocut-key): ดึงบรีฟตั้งแต่ ?since= (ค่าเริ่ม 14 วัน) ใหม่สุดก่อน

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = machineAuthError(request);
  if (denied) return denied;
  if (!hasAdminCredentials()) return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
  const since = resolveSince(new URL(request.url).searchParams.get("since"));
  if (!since) return badRequest("invalid_since");
  try {
    const snap = await db()
      .collection(CLIP_BRIEFS_COLLECTION)
      .where("createdAt", ">=", since)
      .orderBy("createdAt", "desc")
      .limit(500)
      .get();
    return NextResponse.json({ since, briefs: snap.docs.map((doc) => ({ ...doc.data(), id: doc.id })) });
  } catch (error) {
    return NextResponse.json({ error: "read_failed", detail: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { user, staffCode } = await actor();
  if (!canWriteNow(user)) return readOnly();
  if (!hasAdminCredentials()) return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });

  const parsed = validateClipBrief(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: "bad_request", detail: parsed.error }, { status: 400 });

  // ตัวตนผู้ส่งมาจาก session เสมอ ไม่เชื่อค่าที่ browser ส่งมา
  const createdAt = new Date().toISOString();
  const doc = buildClipBriefDoc(parsed.value, { id: staffCode || user.email, name: user.name, email: user.email }, createdAt);
  try {
    const ref = db().collection(CLIP_BRIEFS_COLLECTION).doc();
    await ref.create({ ...doc, id: ref.id });
    return NextResponse.json({ ok: true, id: ref.id, createdAt });
  } catch (error) {
    return NextResponse.json({ error: "write_failed", detail: String(error) }, { status: 500 });
  }
}
