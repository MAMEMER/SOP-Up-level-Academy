import { NextResponse } from "next/server";
import { actor, badRequest, canWriteNow, db, forbidden, isAdmin, readOnly } from "../../../lib/api-firestore.ts";
import { hasAdminCredentials } from "../../../lib/firebase-admin.ts";
import { isValidLinkUrl } from "../../../lib/checklist-links.ts";
import {
  COACHING_NOTES_COLLECTION,
  MAX_NOTE_IMAGES,
  validateNoteDraft,
  type CoachingNote
} from "../../../lib/coaching-notes.ts";

// คำแนะนำจากหัวหน้าถึงพนักงานรายคน (หน้า /my-review).
//  - อ่าน  : พนักงานอ่านได้เฉพาะของตัวเอง · แอดมินอ่านได้ทุกคน
//  - เขียน/ลบ: แอดมินเท่านั้น และไม่ให้เขียนระหว่าง "ดูเป็นคนนี้" (impersonate)
//  - กดรับทราบ: เจ้าของคำแนะนำคนนั้นเอง (หรือแอดมิน)
// ตัวตนผู้เขียนมาจาก session เสมอ ไม่เชื่อค่าจาก body.

export const dynamic = "force-dynamic";

function newId(iso: string, staffCode: string): string {
  return `cn__${iso}__${staffCode}`.replace(/[^a-zA-Z0-9_:\-.]/g, "-").slice(0, 140);
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const docId = (v: unknown) => {
  const value = str(v).trim();
  return value && !value.includes("/") ? value : "";
};
const safeUrls = (v: unknown) =>
  (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [])
    .map((url) => url.trim())
    // รูปถูกเรนเดอร์เป็น <img src> / <a href> ให้คนกด — รับเฉพาะ https หรือ path ในเว็บนี้
    .filter((url) => isValidLinkUrl(url))
    .slice(0, MAX_NOTE_IMAGES);

export async function GET(request: Request) {
  const { user, staffCode } = await actor();
  const params = new URL(request.url).searchParams;
  const requested = str(params.get("staffCode")).trim();
  // พนักงานอ่านได้เฉพาะของตัวเอง แม้จะขอ code คนอื่นมาก็ตาม (กติกาเดียวกับหน้าคะแนน)
  const target = isAdmin(user) ? requested || staffCode : staffCode;
  if (!target) return NextResponse.json({ notes: [] });
  if (!hasAdminCredentials()) return NextResponse.json({ notes: [] });

  try {
    const snap = await db().collection(COACHING_NOTES_COLLECTION).where("staffCode", "==", target).get();
    const notes = snap.docs.map((doc) => doc.data() as CoachingNote);
    return NextResponse.json({ notes });
  } catch (error) {
    return NextResponse.json({ error: "read_failed", detail: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { user, staffCode } = await actor();
  if (!canWriteNow(user)) return readOnly();
  if (!hasAdminCredentials()) return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { action?: string; [k: string]: unknown } | null;
  if (!body || typeof body.action !== "string") return badRequest("missing_action");
  const nowIso = new Date().toISOString();

  try {
    switch (body.action) {
      // ── หัวหน้าส่งคำแนะนำให้พนักงานคนหนึ่ง ────────────────────────────────
      case "createNote": {
        if (!isAdmin(user)) return forbidden();
        const target = str(body.staffCode).trim();
        const note = str(body.note).trim();
        const images = safeUrls(body.images);
        const invalid = validateNoteDraft({ staffCode: target, note, images });
        if (invalid) return badRequest(invalid);
        const id = newId(nowIso, target);
        const record: CoachingNote = {
          id,
          branch: str(body.branch) || "bangkae",
          staffCode: target,
          period: str(body.period) || nowIso.slice(0, 7),
          note,
          ...(images.length ? { images } : {}),
          createdBy: user.actualEmail,
          ...(user.actualName ? { createdByName: user.actualName } : {}),
          createdAt: nowIso
        };
        await db().collection(COACHING_NOTES_COLLECTION).doc(id).set(record);
        return NextResponse.json({ ok: true, id });
      }

      // ── พนักงานกดรับทราบคำแนะนำของตัวเอง ─────────────────────────────────
      case "acknowledgeNote": {
        const id = docId(body.id);
        if (!id) return badRequest("missing_id");
        const ref = db().collection(COACHING_NOTES_COLLECTION).doc(id);
        const snap = await ref.get();
        if (!snap.exists) return badRequest("not_found");
        const current = snap.data() as CoachingNote;
        if (!isAdmin(user) && current.staffCode !== staffCode) return forbidden();
        // กดซ้ำไม่เขียนทับเวลาเดิม — เวลารับทราบครั้งแรกคือค่าที่ตรวจย้อนหลังได้
        if (!current.acknowledgedAt) await ref.update({ acknowledgedAt: nowIso });
        return NextResponse.json({ ok: true });
      }

      // ── หัวหน้าลบคำแนะนำที่ส่งผิด ─────────────────────────────────────────
      case "deleteNote": {
        if (!isAdmin(user)) return forbidden();
        const id = docId(body.id);
        if (!id) return badRequest("missing_id");
        await db().collection(COACHING_NOTES_COLLECTION).doc(id).delete();
        return NextResponse.json({ ok: true });
      }

      default:
        return badRequest("unknown_action");
    }
  } catch (error) {
    return NextResponse.json({ error: "write_failed", detail: String(error) }, { status: 500 });
  }
}
