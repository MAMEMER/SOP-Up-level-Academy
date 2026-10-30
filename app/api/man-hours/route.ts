import { NextResponse } from "next/server";
import { actor, badRequest, canWriteNow, db, forbidden, readOnly } from "../../../lib/api-firestore.ts";
import { isOwner } from "../../../lib/owner.ts";
import { isBranchKey } from "../../../lib/admin-branch.ts";
import { normalizeEstimates, normalizeSettings } from "../../../lib/man-hours.ts";

// บันทึก "นาทีต่องาน" ของตัวประเมิน man-hour (/admin/man-hours) — เจ้าของเท่านั้น.
// อ่านข้อมูลทำฝั่ง server component (lib/man-hours-server.ts) ไม่ต้องมี GET.

export const dynamic = "force-dynamic";
const COLLECTION = "sop_man_hours";

export async function POST(request: Request) {
  const { user } = await actor();
  if (!canWriteNow(user)) return readOnly();
  if (!isOwner(user.actualEmail)) return forbidden();

  const body = (await request.json().catch(() => null)) as { branch?: string; estimates?: unknown; settings?: unknown } | null;
  if (!body || !isBranchKey(body.branch)) return badRequest("bad_branch");

  const record = {
    branch: body.branch,
    estimates: normalizeEstimates(body.estimates),
    settings: normalizeSettings(body.settings),
    updatedAt: new Date().toISOString(),
    updatedBy: user.actualEmail
  };
  try {
    await db().collection(COLLECTION).doc(body.branch).set(record);
    return NextResponse.json({ ok: true, updatedAt: record.updatedAt, updatedBy: record.updatedBy });
  } catch (error) {
    return NextResponse.json({ error: "write_failed", detail: String(error) }, { status: 500 });
  }
}
