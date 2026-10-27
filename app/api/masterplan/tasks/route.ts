import { NextResponse } from "next/server";
import { masterplanApiMember } from "../../../../lib/masterplan-auth.ts";
import { bad, docId, editorsOnly, fail, readBody, storeError, text } from "../../../../lib/masterplan-api.ts";
import { bumpSequence, listTasks, nextSequence, putOne, updateOne } from "../../../../lib/masterplan-store.ts";
import { MASTERPLAN_MEMBERS } from "../../../../lib/masterplan-access.ts";
import {
  formatCode,
  idFromCode,
  isTaskStatus,
  nextCodeNumber,
  parseTaskImport,
  planTaskImport,
  validateTaskDraft,
  type MpTask
} from "../../../../lib/masterplan.ts";

// งาน (mp_tasks).
//  POST  { action: "create", draft }      → any member; code T-###
//  POST  { action: "import", text }       → editors; JSON array, idempotent by code
//  PATCH { id, action: "claim" }          → owner = me
//  PATCH { id, action: "status", status } → any member
//  PATCH { id, action: "update", draft }  → any member (small trusted team; createdBy is kept)

export const dynamic = "force-dynamic";

const memberKeys = MASTERPLAN_MEMBERS.map((m) => m.key as string);

export async function POST(request: Request) {
  const auth = await masterplanApiMember();
  if (auth.error) return auth.error;
  const member = auth.member;
  const body = await readBody(request);
  const action = text(body.action);
  const now = new Date().toISOString();

  try {
    if (action === "create") {
      const checked = validateTaskDraft(body.draft, memberKeys);
      if (!checked.ok) return bad(checked.error);
      const code = formatCode("T", await nextSequence("task"));
      const id = idFromCode(code);
      await putOne<MpTask>("mp_tasks", id, {
        id,
        code,
        ...checked.value,
        source: text((body.draft as Record<string, unknown> | undefined)?.source).trim().slice(0, 200),
        createdBy: member.key,
        createdAt: now,
        updatedAt: now
      });
      return NextResponse.json({ ok: true, id, code });
    }

    if (action === "import") {
      if (!member.editor) return editorsOnly();
      const parsed = parseTaskImport(text(body.text));
      if (!parsed.ok) return bad(parsed.error);
      const existing = await listTasks();
      const plan = planTaskImport(parsed.value.rows, existing.map((t) => t.code));
      for (const row of plan.create) {
        const id = idFromCode(row.code);
        await putOne<MpTask>("mp_tasks", id, {
          id,
          code: row.code,
          title: row.title,
          detail: row.detail,
          missions: row.missions,
          owner: row.owner,
          due: row.due,
          status: "ยังไม่เริ่ม",
          source: row.source || "นำเข้า",
          createdBy: member.key,
          createdAt: now,
          updatedAt: now
        });
      }
      // keep T-### numbering ahead of any imported T-codes
      const highest = nextCodeNumber([...existing.map((t) => t.code), ...plan.create.map((r) => r.code)], "T") - 1;
      if (highest > 0) await bumpSequence("task", highest);
      return NextResponse.json({ ok: true, created: plan.create.length, existing: plan.existing.length, skipped: parsed.value.skipped });
    }

    return bad("unknown action");
  } catch (error) {
    return storeError(error);
  }
}

export async function PATCH(request: Request) {
  const auth = await masterplanApiMember();
  if (auth.error) return auth.error;
  const member = auth.member;
  const body = await readBody(request);
  const id = docId(body.id);
  if (!id) return bad("ไม่พบงาน");
  const action = text(body.action);

  let draft: ReturnType<typeof validateTaskDraft> | null = null;
  if (action === "update") {
    draft = validateTaskDraft(body.draft, memberKeys);
    if (!draft.ok) return bad(draft.error);
  } else if (action === "status") {
    if (!isTaskStatus(body.status)) return bad("สถานะงานไม่ถูกต้อง");
  } else if (action !== "claim") {
    return bad("unknown action");
  }

  try {
    const saved = await updateOne<MpTask>("mp_tasks", id, (current) => {
      if (!current) return null;
      const next: MpTask = { ...current, updatedAt: new Date().toISOString() };
      if (action === "claim") {
        next.owner = member.key;
        if (next.status === "ยังไม่เริ่ม") next.status = "กำลังทำ";
      } else if (action === "status" && isTaskStatus(body.status)) {
        next.status = body.status;
      } else if (draft && draft.ok) {
        Object.assign(next, draft.value);
      }
      return { data: next, result: next };
    });
    if (!saved) return fail(404, "ไม่พบงาน");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return storeError(error);
  }
}
