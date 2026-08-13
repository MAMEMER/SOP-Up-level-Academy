import { NextResponse } from "next/server";
import { actor, badRequest, canWriteNow, db, forbidden, isAdmin, readOnly } from "../../../lib/api-firestore.ts";
import {
  CHECKLIST_SCOPES,
  emptyChecklistScopeConfig,
  normalizeScopeConfig,
  type ChecklistScope,
  type ChecklistScopeConfig
} from "../../../lib/checklist-overrides.ts";

// Server route for the owner-edited WEEKLY / MONTHLY checklist overrides. Mirrors the daily
// /api/checklist-config route: read is open to any signed-in user (the staff checklist pages
// render the tailored list), write is admin only and never while impersonating. One document
// per scope (weekly-stock / monthly-stock / weekly-event).

export const dynamic = "force-dynamic";
const COLLECTION = "sop_checklist_overrides";

function scopeFrom(request: Request): ChecklistScope | null {
  const scope = new URL(request.url).searchParams.get("scope") || "";
  return (CHECKLIST_SCOPES as string[]).includes(scope) ? (scope as ChecklistScope) : null;
}

export async function GET(request: Request) {
  await actor();
  const scope = scopeFrom(request);
  if (!scope) return badRequest("bad_scope");
  try {
    const snap = await db().collection(COLLECTION).doc(scope).get();
    if (!snap.exists) {
      return NextResponse.json({ ...emptyChecklistScopeConfig, updatedAt: null, updatedBy: null });
    }
    const data = snap.data() as Record<string, unknown>;
    // order / hidden / customUnits arrived with the "same format as Daily" editor — a doc saved
    // before them simply has none, and normalizeScopeConfig fills the blanks.
    const config = normalizeScopeConfig(data as Partial<ChecklistScopeConfig>);
    // Surface when/who last saved so the editor can show a "แก้ไขล่าสุด" line, mirroring the daily
    // config route (older docs written before these fields existed simply return null).
    return NextResponse.json({
      ...config,
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
      updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : null
    });
  } catch (error) {
    return NextResponse.json({ error: "read_failed", detail: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { user } = await actor();
  if (!canWriteNow(user)) return readOnly();
  if (!isAdmin(user)) return forbidden();

  const body = (await request.json().catch(() => null)) as
    | ({ scope?: string } & Partial<ChecklistScopeConfig>)
    | null;
  const scope = body && (CHECKLIST_SCOPES as string[]).includes(body.scope || "") ? (body.scope as ChecklistScope) : null;
  if (!scope || !body || typeof body.overrides !== "object" || body.overrides === null) return badRequest("bad_request");

  // ธง migratedToTasks ตั้งโดยการย้ายงาน ไม่ได้อยู่ในฟอร์ม — อ่านค่าเดิมมาคงไว้ ไม่งั้นกดบันทึก
  // จากหน้า config เดิมทีเดียว รายการจะกลับมาโผล่ซ้ำกับระบบใหม่
  const previous = await db().collection(COLLECTION).doc(scope).get().catch(() => null);
  const migratedToTasks = Boolean(previous?.exists && (previous.data() as { migratedToTasks?: boolean }).migratedToTasks);
  const record = {
    scope,
    ...normalizeScopeConfig(body),
    ...(migratedToTasks ? { migratedToTasks: true } : {}),
    updatedAt: new Date().toISOString(),
    updatedBy: user.actualEmail
  };
  try {
    await db().collection(COLLECTION).doc(scope).set(record);
    return NextResponse.json({ ok: true, updatedAt: record.updatedAt, updatedBy: record.updatedBy });
  } catch (error) {
    return NextResponse.json({ error: "write_failed", detail: String(error) }, { status: 500 });
  }
}
