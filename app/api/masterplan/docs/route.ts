import { NextResponse } from "next/server";
import { masterplanApiMember } from "../../../../lib/masterplan-auth.ts";
import { bad, editorsOnly, readBody, storeError, text } from "../../../../lib/masterplan-api.ts";
import { saveDocVersion } from "../../../../lib/masterplan-store.ts";
import { MASTER_SLUG, checkDocSize, isDocSlug, replaceSectionBody, splitSections } from "../../../../lib/masterplan.ts";
import { plainHeading } from "../../../../lib/masterplan-markdown.ts";

// Masterplan documents (mp_docs). Editors only (แชมป์ / ท้อป):
//  action "import"       — replace a whole doc with pasted/uploaded markdown (changelog "นำเข้า")
//  action "edit-section" — edit one section of ฉบับกลาง directly; a reason is required
// Both bump the version and are rejected on a version conflict.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await masterplanApiMember();
  if (auth.error) return auth.error;
  const member = auth.member;
  if (!member.editor) return editorsOnly();

  const body = await readBody(request);
  const action = text(body.action);
  const slug = text(body.slug);
  if (!isDocSlug(slug)) return bad("ไม่รู้จักเอกสารนี้");

  try {
    if (action === "import") {
      const markdown = text(body.markdown).replace(/\r\n?/g, "\n");
      if (!markdown.trim()) return bad("ยังไม่มีเนื้อหา");
      const size = checkDocSize(markdown);
      if (!size.ok) return bad(size.error);
      const title = text(body.title).trim();
      const doc = await saveDocVersion({
        slug,
        title: title || undefined,
        baseVersion: null,
        by: member.key,
        compute: () => markdown,
        changelog: () => ({ summary: `นำเข้า: ${title || slug} (${Math.max(1, Math.round(size.value / 1024))} KB)`, proposalCode: null })
      });
      return NextResponse.json({ ok: true, version: doc.version });
    }

    if (action === "edit-section") {
      if (slug !== MASTER_SLUG) return bad("แก้ตรงได้เฉพาะฉบับกลาง");
      const reason = text(body.reason).trim();
      if (!reason) return bad("ต้องใส่เหตุผลที่แก้ตรง");
      if (reason.length > 2000) return bad("เหตุผลยาวเกินไป");
      const baseVersion = Number(body.baseVersion);
      const sectionIndex = Number(body.sectionIndex);
      if (!Number.isInteger(baseVersion) || !Number.isInteger(sectionIndex)) return bad("ข้อมูลไม่ครบ");
      const baseBody = text(body.baseBody);
      const newBody = text(body.newBody).replace(/\r\n?/g, "\n");
      let heading = "";
      const doc = await saveDocVersion({
        slug,
        baseVersion,
        by: member.key,
        compute: (current) => {
          if (!current) return { error: "ยังไม่มีฉบับกลาง" };
          heading = plainHeading(splitSections(current.markdown)[sectionIndex]?.heading || "ส่วนนำ");
          const next = replaceSectionBody(current.markdown, sectionIndex, baseBody, newBody);
          return next.ok ? next.value : { error: next.error };
        },
        changelog: () => ({ summary: `แก้ตรง: ${heading || "ส่วนนำ"} — ${reason}`, proposalCode: null })
      });
      return NextResponse.json({ ok: true, version: doc.version });
    }

    return bad("unknown action");
  } catch (error) {
    return storeError(error);
  }
}
