import { NextResponse } from "next/server";
import { actor, badRequest, canWriteNow, db, forbidden, isAdmin, readOnly } from "../../../lib/api-firestore.ts";
import { emptyChecklistConfig, type ChecklistConfig } from "../../../lib/daily-checklist.ts";

// Server route for the owner-edited daily checklist config (fix 1). Replaces the client
// store (lib/daily-checklist-store.ts). Read: any signed-in user (the checklist page and
// dashboard render the tailored routine). Write: admin only (the editor lives on the
// admin-guarded config pages), never while impersonating.

export const dynamic = "force-dynamic";
const COLLECTION = "sop_daily_checklist";

export async function GET(request: Request) {
  await actor();
  const branch = new URL(request.url).searchParams.get("branch") || "";
  if (!branch) return badRequest("missing_branch");
  try {
    const snap = await db().collection(COLLECTION).doc(branch).get();
    if (!snap.exists) return NextResponse.json({ config: emptyChecklistConfig });
    const data = snap.data() as Record<string, unknown>;
    const config: ChecklistConfig = {
      overrides: (data.overrides as ChecklistConfig["overrides"]) ?? {},
      windows: (data.windows as ChecklistConfig["windows"]) ?? {},
      order: (data.order as ChecklistConfig["order"]) ?? [],
      shifts: (data.shifts as ChecklistConfig["shifts"]) ?? {},
      manual: (data.manual as ChecklistConfig["manual"]) ?? {},
      customPhases: (data.customPhases as ChecklistConfig["customPhases"]) ?? [],
      hiddenPhases: (data.hiddenPhases as ChecklistConfig["hiddenPhases"]) ?? [],
      titles: (data.titles as ChecklistConfig["titles"]) ?? {},
      evidence: (data.evidence as ChecklistConfig["evidence"]) ?? {}
    };
    return NextResponse.json({ config });
  } catch (error) {
    return NextResponse.json({ error: "read_failed", detail: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { user } = await actor();
  if (!canWriteNow(user)) return readOnly();
  if (!isAdmin(user)) return forbidden();

  const body = (await request.json().catch(() => null)) as { branch?: string; config?: ChecklistConfig } | null;
  if (!body || typeof body.branch !== "string" || !body.branch || !body.config || typeof body.config !== "object")
    return badRequest("bad_request");

  const c = body.config;
  const record = {
    branch: body.branch,
    overrides: c.overrides ?? {},
    windows: c.windows ?? {},
    order: c.order ?? [],
    shifts: c.shifts ?? {},
    manual: c.manual ?? {},
    customPhases: c.customPhases ?? [],
    hiddenPhases: c.hiddenPhases ?? [],
    titles: c.titles ?? {},
    evidence: c.evidence ?? {},
    updatedAt: new Date().toISOString(),
    updatedBy: user.actualEmail
  };
  try {
    await db().collection(COLLECTION).doc(body.branch).set(record);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "write_failed", detail: String(error) }, { status: 500 });
  }
}
