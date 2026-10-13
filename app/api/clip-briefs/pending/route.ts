import { NextResponse } from "next/server";
import { actor, badRequest, db } from "../../../../lib/api-firestore.ts";
import { hasAdminCredentials } from "../../../../lib/firebase-admin.ts";
import { machineAuthError } from "../../../../lib/clip-briefs-server.ts";
import {
  AUTOCUT_PENDING_COLLECTION,
  AUTOCUT_PENDING_DOC,
  CLIP_BRIEFS_COLLECTION,
  markPendingWithBriefs,
  validatePendingFolders,
  type PendingFolder
} from "../../../../lib/clip-briefs.ts";

// โฟลเดอร์ใน Footage/ ที่ Mac mini เห็นแต่ยังไม่ได้ตัด
//  - POST (Mac mini, x-autocut-key): ส่งรายการทั้งหมดมาแทนที่ autocut_pending/current
//  - GET  (พนักงาน, session): รายการนั้น + ป้ายว่าโฟลเดอร์ไหนมีบรีฟแล้ว

export const dynamic = "force-dynamic";

const pendingRef = () => db().collection(AUTOCUT_PENDING_COLLECTION).doc(AUTOCUT_PENDING_DOC);

export async function GET() {
  await actor();
  if (!hasAdminCredentials()) return NextResponse.json({ folders: [], updatedAt: null });
  try {
    const snap = await pendingRef().get();
    const data = (snap.exists ? snap.data() : null) as { folders?: PendingFolder[]; updatedAt?: string } | null;
    const folders = Array.isArray(data?.folders) ? data.folders : [];
    // บรีฟ 60 วันล่าสุดพอสำหรับบอกว่าโฟลเดอร์ไหนบรีฟแล้ว
    const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const briefs = folders.length
      ? await db().collection(CLIP_BRIEFS_COLLECTION).where("createdAt", ">=", since).select("folderKey").get()
      : null;
    const keys = briefs ? briefs.docs.map((doc) => String(doc.get("folderKey") ?? "")) : [];
    return NextResponse.json({ folders: markPendingWithBriefs(folders, keys), updatedAt: data?.updatedAt ?? null });
  } catch (error) {
    return NextResponse.json({ error: "read_failed", detail: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = machineAuthError(request);
  if (denied) return denied;
  if (!hasAdminCredentials()) return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
  const parsed = validatePendingFolders(await request.json().catch(() => null));
  if (!parsed.ok) return badRequest(parsed.error);
  const updatedAt = new Date().toISOString();
  try {
    await pendingRef().set({ folders: parsed.value, updatedAt });
    return NextResponse.json({ ok: true, count: parsed.value.length, updatedAt });
  } catch (error) {
    return NextResponse.json({ error: "write_failed", detail: String(error) }, { status: 500 });
  }
}
