import { NextResponse } from "next/server";
import { masterplanApiMember } from "../../../../lib/masterplan-auth.ts";
import { bad, editorsOnly, readBody, storeError, text } from "../../../../lib/masterplan-api.ts";
import { MASTERPLAN_MEMBERS } from "../../../../lib/masterplan-access.ts";
import { mpStore } from "../../../../lib/masterplan-store.ts";
import { bangkokDate } from "../../../../lib/masterplan.ts";
import { createTaskFromStep, importKpis, parseKpiImport, setStepDone, updateKpi } from "../../../../lib/masterplan-kpi.ts";

// ตัวชี้วัด (mp_kpis). The acting member always comes from the session.
//  POST  { action: "import", text }                     → editors; JSON array, upsert by code (target never overwritten)
//  PATCH { code, action: "edit", patch, reason }        → any member; status/gaps/nextSteps/dataSources/baseline only
//  PATCH { code, action: "step", stepId, done }         → any member; tick/untick a next step (who + when stored)
//  PATCH { code, action: "task", stepId }               → any member; "สร้างเป็นงาน" (idempotent per step)
// There is no way to write `target` here: targets come only through proposals.

export const dynamic = "force-dynamic";

const memberKeys = MASTERPLAN_MEMBERS.map((m) => m.key as string);

export async function POST(request: Request) {
  const auth = await masterplanApiMember();
  if (auth.error) return auth.error;
  const member = auth.member;
  const body = await readBody(request);
  if (text(body.action) !== "import") return bad("unknown action");
  if (!member.editor) return editorsOnly();
  const now = new Date();
  const parsed = parseKpiImport(text(body.text), bangkokDate(now));
  if (!parsed.ok) return bad(parsed.error);
  try {
    const report = await importKpis(mpStore, parsed.value.rows, parsed.value.errors, member.key, now);
    return NextResponse.json({ ok: true, created: report.created.length, updated: report.updated.length, skipped: report.skipped });
  } catch (error) {
    return storeError(error);
  }
}

export async function PATCH(request: Request) {
  const auth = await masterplanApiMember();
  if (auth.error) return auth.error;
  const member = auth.member;
  const body = await readBody(request);
  const code = text(body.code).trim();
  const action = text(body.action);
  if (!code) return bad("ไม่พบตัวชี้วัด");
  try {
    if (action === "edit") {
      const saved = await updateKpi(mpStore, { code, patch: body.patch, reason: text(body.reason), by: member.key });
      return saved.ok ? NextResponse.json({ ok: true }) : bad(saved.error);
    }
    if (action === "step") {
      if (typeof body.done !== "boolean") return bad("ข้อมูลไม่ครบ");
      const saved = await setStepDone(mpStore, code, text(body.stepId), body.done, member.key);
      return saved.ok ? NextResponse.json({ ok: true, step: saved.value }) : bad(saved.error);
    }
    if (action === "task") {
      const made = await createTaskFromStep(mpStore, code, text(body.stepId), member.key, memberKeys);
      return made.ok ? NextResponse.json({ ok: true, ...made.value }) : bad(made.error);
    }
    return bad("unknown action");
  } catch (error) {
    return storeError(error);
  }
}
