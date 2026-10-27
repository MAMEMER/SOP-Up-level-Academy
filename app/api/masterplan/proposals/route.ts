import { NextResponse } from "next/server";
import { masterplanApiMember } from "../../../../lib/masterplan-auth.ts";
import { bad, docId, fail, readBody, storeError, text } from "../../../../lib/masterplan-api.ts";
import { createProposalCode, deleteOne, getProposal, putOne, updateOne } from "../../../../lib/masterplan-store.ts";
import {
  bangkokDate,
  canDeleteProposal,
  canEditProposal,
  canTransition,
  idFromCode,
  isProposalStatus,
  isVerdict,
  validateProposalDraft,
  type MpProposal
} from "../../../../lib/masterplan.ts";

// ข้อเสนอ (mp_proposals).
//  POST   { items: ProposalDraft[], submit?: boolean } → create as ร่าง (or รอคุย when submit)
//  PATCH  { id, action: "edit", draft }                → owner edits own ร่าง/รอคุย
//  PATCH  { id, action: "status", to, note? }          → transitions per canTransition()
//  DELETE { id }                                       → owner deletes own ร่าง
// The proposer is ALWAYS the session member; ลงแล้ว only happens through /api/masterplan/apply.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await masterplanApiMember();
  if (auth.error) return auth.error;
  const body = await readBody(request);
  const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
  if (items.length === 0) return bad("ไม่มีข้อเสนอให้บันทึก");
  const drafts = [];
  for (const [i, item] of items.entries()) {
    const checked = validateProposalDraft(item);
    if (!checked.ok) return bad(items.length > 1 ? `ข้อเสนอที่ ${i + 1}: ${checked.error}` : checked.error);
    drafts.push(checked.value);
  }
  const status = body.submit === true ? "รอคุย" : "ร่าง";
  try {
    const created: { id: string; code: string }[] = [];
    for (const draft of drafts) {
      const code = await createProposalCode();
      const id = idFromCode(code);
      const now = new Date().toISOString();
      await putOne<MpProposal>("mp_proposals", id, {
        id,
        code,
        ...draft,
        proposer: auth.member.key,
        status,
        decidedOn: null,
        decisionNote: "",
        createdAt: now,
        updatedAt: now
      });
      created.push({ id, code });
    }
    return NextResponse.json({ ok: true, created });
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
  if (!id) return bad("ไม่พบข้อเสนอ");
  const action = text(body.action);

  try {
    if (action === "edit") {
      const checked = validateProposalDraft(body.draft);
      if (!checked.ok) return bad(checked.error);
      let denied = false;
      const saved = await updateOne<MpProposal>("mp_proposals", id, (current) => {
        if (!current || !canEditProposal(current, member)) {
          denied = true;
          return null;
        }
        const next = { ...current, ...checked.value, updatedAt: new Date().toISOString() };
        return { data: next, result: next };
      });
      if (!saved) return denied ? fail(403, "แก้ได้เฉพาะข้อเสนอของตัวเองที่ยังเป็นร่าง/รอคุย") : fail(404, "ไม่พบข้อเสนอ");
      return NextResponse.json({ ok: true });
    }

    if (action === "status") {
      const to = text(body.to);
      if (!isProposalStatus(to) || to === "ลงแล้ว") return bad("สถานะไม่ถูกต้อง");
      const note = text(body.note).trim().slice(0, 2000);
      const today = bangkokDate();
      const result = await updateOne<MpProposal, "ok">("mp_proposals", id, (current) => {
        if (!current || !canTransition(current, to, member)) return null;
        const next: MpProposal = { ...current, status: to, updatedAt: new Date().toISOString() };
        if (isVerdict(to)) {
          next.decidedOn = today;
          next.decisionNote = note;
        } else if (isVerdict(current.status)) {
          // undo a verdict → back on the agenda
          next.decidedOn = null;
          next.decisionNote = "";
        }
        return { data: next, result: "ok" };
      });
      if (!result) return fail(403, "เปลี่ยนสถานะนี้ไม่ได้");
      return NextResponse.json({ ok: true });
    }

    return bad("unknown action");
  } catch (error) {
    return storeError(error);
  }
}

export async function DELETE(request: Request) {
  const auth = await masterplanApiMember();
  if (auth.error) return auth.error;
  const body = await readBody(request);
  const id = docId(body.id);
  if (!id) return bad("ไม่พบข้อเสนอ");
  try {
    const current = await getProposal(id);
    if (!current) return fail(404, "ไม่พบข้อเสนอ");
    if (!canDeleteProposal(current, auth.member)) return fail(403, "ลบได้เฉพาะร่างของตัวเอง");
    await deleteOne("mp_proposals", id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return storeError(error);
  }
}
