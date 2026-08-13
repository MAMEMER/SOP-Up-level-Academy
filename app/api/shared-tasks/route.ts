import { NextResponse } from "next/server";
import { actor, badRequest, canWriteNow, db, readOnly } from "../../../lib/api-firestore.ts";
import { isValidLinkUrl } from "../../../lib/checklist-links.ts";

// Server route for the shared weekly/monthly checklist ticks (fix 1). Replaces the client
// store (lib/shared-tasks-store.ts). Read + tick: any signed-in staffer (the whole team
// finishes the list together), never while impersonating. The "by" stamp comes from the
// session, and the toggle is applied server-side (read-modify-write) so one browser cannot
// clobber another's ticks by posting a stale map.

export const dynamic = "force-dynamic";
const SHARED = "sop_shared_tasks";

/** `value` / `photos` = คำตอบที่เจ้าของสั่งให้กรอกตอนติ๊ก (ดู lib/checklist-overrides ItemAnswer) */
type SharedTick = { by: string; at: string; value?: string; photos?: string[] };

const docId = (branch: string, period: string, periodKey: string) => `${branch}__${period}__${periodKey}`;

function isPeriod(v: unknown): v is "weekly" | "monthly" {
  return v === "weekly" || v === "monthly";
}

export async function GET(request: Request) {
  await actor();
  const p = new URL(request.url).searchParams;
  const branch = p.get("branch") || "";
  const period = p.get("period") || "";
  const periodKey = p.get("periodKey") || "";
  if (!branch || !isPeriod(period) || !periodKey) return badRequest("missing_params");
  try {
    const snap = await db().collection(SHARED).doc(docId(branch, period, periodKey)).get();
    const ticks = snap.exists ? ((snap.data() as { ticks?: Record<string, SharedTick> }).ticks ?? {}) : {};
    return NextResponse.json({ ticks });
  } catch (error) {
    return NextResponse.json({ error: "read_failed", detail: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { user, staffCode } = await actor();
  if (!canWriteNow(user)) return readOnly();

  const body = (await request.json().catch(() => null)) as
    | { branch?: string; period?: string; periodKey?: string; taskId?: string; ticked?: boolean; value?: unknown; photos?: unknown }
    | null;
  if (!body || !body.branch || !isPeriod(body.period) || !body.periodKey || !body.taskId)
    return badRequest("missing_params");

  const nowIso = new Date().toISOString();
  const by = staffCode || user.name || user.actualEmail;
  const ref = db().collection(SHARED).doc(docId(body.branch, body.period, body.periodKey));
  try {
    const snap = await ref.get();
    const ticks: Record<string, SharedTick> = snap.exists
      ? { ...((snap.data() as { ticks?: Record<string, SharedTick> }).ticks ?? {}) }
      : {};
    // คำตอบที่แนบมากับการติ๊ก: ตัดความยาว และรับเฉพาะ URL รูปที่ปลอดภัย (กัน javascript: หลุดไป
    // เป็นลิงก์ให้คนอื่นกด) — ส่วนจะ "ต้องกรอกไหม" หน้าจอเป็นคนบังคับตามที่เจ้าของตั้งไว้
    const value = typeof body.value === "string" ? body.value.trim().slice(0, 500) : "";
    const photos = Array.isArray(body.photos)
      ? body.photos.filter((url): url is string => typeof url === "string" && isValidLinkUrl(url)).slice(0, 3)
      : [];
    if (body.ticked)
      ticks[body.taskId] = { by, at: nowIso, ...(value ? { value } : {}), ...(photos.length ? { photos } : {}) };
    else delete ticks[body.taskId];
    await ref.set(
      { branch: body.branch, period: body.period, periodKey: body.periodKey, ticks, updatedAt: nowIso },
      { merge: true }
    );
    return NextResponse.json({ ticks });
  } catch (error) {
    return NextResponse.json({ error: "write_failed", detail: String(error) }, { status: 500 });
  }
}
