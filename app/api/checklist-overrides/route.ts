import { NextResponse } from "next/server";
import { actor, badRequest, canWriteNow, db, forbidden, isAdmin, readOnly } from "../../../lib/api-firestore.ts";
import {
  CHECKLIST_SCOPES,
  emptyChecklistOverrides,
  normalizeChecklistOverrides,
  type ChecklistOverrides,
  type ChecklistScope
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
    if (!snap.exists) return NextResponse.json({ overrides: emptyChecklistOverrides, updatedAt: null, updatedBy: null });
    const data = snap.data() as Record<string, unknown>;
    const overrides = (data.overrides as ChecklistOverrides) ?? {};
    // Surface when/who last saved so the editor can show a "แก้ไขล่าสุด" line, mirroring the daily
    // config route (older docs written before these fields existed simply return null).
    return NextResponse.json({
      overrides,
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
    | { scope?: string; overrides?: ChecklistOverrides }
    | null;
  const scope = body && (CHECKLIST_SCOPES as string[]).includes(body.scope || "") ? (body.scope as ChecklistScope) : null;
  if (!scope || !body || typeof body.overrides !== "object" || body.overrides === null) return badRequest("bad_request");

  const record = {
    scope,
    overrides: normalizeChecklistOverrides(body.overrides),
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
