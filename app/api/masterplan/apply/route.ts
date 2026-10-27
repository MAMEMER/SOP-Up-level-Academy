import { NextResponse } from "next/server";
import { masterplanApiMember } from "../../../../lib/masterplan-auth.ts";
import { bad, docId, editorsOnly, fail, readBody, storeError, text } from "../../../../lib/masterplan-api.ts";
import { addChangelog, getDoc, getProposal, saveDocVersion, updateOne } from "../../../../lib/masterplan-store.ts";
import { MASTER_SLUG, applyExactReplace, replaceSectionBody, type MpProposal } from "../../../../lib/masterplan.ts";

// นำเข้าฉบับกลาง — apply an accepted (ลง) proposal to mp_docs/master. Editors only.
//  mode "replace" — oldText occurs exactly once → swap it for newText (checked on the server)
//  mode "section" — the editor rewrote the relevant section by hand
//  mode "none"    — nothing to change in the text (e.g. a คำถาม that got answered)
// The doc save is version-checked; then the proposal becomes ลงแล้ว and a changelog line is written.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await masterplanApiMember();
  if (auth.error) return auth.error;
  const member = auth.member;
  if (!member.editor) return editorsOnly();
  const body = await readBody(request);
  const id = docId(body.proposalId);
  const mode = text(body.mode);
  if (!id) return bad("ไม่พบข้อเสนอ");

  try {
    const proposal = await getProposal(id);
    if (!proposal) return fail(404, "ไม่พบข้อเสนอ");
    if (proposal.status !== "ลง") return fail(409, "ข้อเสนอนี้ยังไม่ได้มติ \"ลง\" หรือถูกนำเข้าไปแล้ว");
    const summary = `${proposal.code} ${proposal.title}`;

    let version: number;
    if (mode === "none") {
      const master = await getDoc(MASTER_SLUG);
      version = master?.version ?? 0;
      await addChangelog({
        at: new Date().toISOString(),
        by: member.key,
        version,
        proposalCode: proposal.code,
        summary: `${summary} (ไม่ต้องแก้เนื้อหา)`
      });
    } else if (mode === "replace" || mode === "section") {
      const baseVersion = Number(body.baseVersion);
      if (!Number.isInteger(baseVersion)) return bad("ข้อมูลไม่ครบ");
      const sectionIndex = Number(body.sectionIndex);
      const baseBody = text(body.baseBody);
      const newBody = text(body.newBody).replace(/\r\n?/g, "\n");
      if (mode === "section" && !Number.isInteger(sectionIndex)) return bad("ข้อมูลไม่ครบ");
      const doc = await saveDocVersion({
        slug: MASTER_SLUG,
        baseVersion,
        by: member.key,
        compute: (current) => {
          if (!current) return { error: "ยังไม่มีฉบับกลาง — นำเข้าก่อน" };
          const next =
            mode === "replace"
              ? applyExactReplace(current.markdown, proposal.oldText, proposal.newText)
              : replaceSectionBody(current.markdown, sectionIndex, baseBody, newBody);
          return next.ok ? next.value : { error: next.error };
        },
        changelog: () => ({ summary, proposalCode: proposal.code })
      });
      version = doc.version;
    } else {
      return bad("unknown mode");
    }

    await updateOne<MpProposal>("mp_proposals", id, (current) => {
      if (!current) return null;
      const next: MpProposal = { ...current, status: "ลงแล้ว", updatedAt: new Date().toISOString() };
      return { data: next, result: next };
    });
    return NextResponse.json({ ok: true, version });
  } catch (error) {
    return storeError(error);
  }
}
