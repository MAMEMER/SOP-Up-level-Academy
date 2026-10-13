import { NextResponse } from "next/server";
import { badRequest, db } from "../../../../lib/api-firestore.ts";
import { hasAdminCredentials } from "../../../../lib/firebase-admin.ts";
import { machineAuthError } from "../../../../lib/clip-briefs-server.ts";
import { CLIP_BRIEFS_COLLECTION, validateUsed } from "../../../../lib/clip-briefs.ts";

// Mac mini บอกว่าบรีฟนี้ถูกใช้ตัดคลิปงานไหนแล้ว (x-autocut-key)
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = machineAuthError(request);
  if (denied) return denied;
  if (!hasAdminCredentials()) return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
  const parsed = validateUsed(await request.json().catch(() => null));
  if (!parsed.ok) return badRequest(parsed.error);
  const ref = db().collection(CLIP_BRIEFS_COLLECTION).doc(parsed.value.id);
  try {
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const usedAt = new Date().toISOString();
    await ref.update({ usedByJob: parsed.value.job, usedAt });
    return NextResponse.json({ ok: true, id: parsed.value.id, usedAt });
  } catch (error) {
    return NextResponse.json({ error: "write_failed", detail: String(error) }, { status: 500 });
  }
}
