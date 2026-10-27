import { NextResponse } from "next/server";
import { masterplanApiMember } from "../../../../lib/masterplan-auth.ts";
import { bad, editorsOnly, fail, readBody, storeError, text } from "../../../../lib/masterplan-api.ts";
import { editDocSection } from "../../../../lib/masterplan-docs.ts";
import { mpStore, saveDocVersion } from "../../../../lib/masterplan-store.ts";
import { checkDocSize, isDocSlug } from "../../../../lib/masterplan.ts";

// Masterplan documents (mp_docs). Editors only (แชมป์ / ท้อป):
//  action "import"       — replace a whole doc with pasted/uploaded markdown (changelog "นำเข้า")
//  action "edit-section" — edit one section of ฉบับกลาง or a reference doc directly; a reason
//                          is required (lib/masterplan-docs.ts editDocSection)
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
      // editors may edit ฉบับกลาง and every reference doc section by section (reason required)
      const edited = await editDocSection(mpStore, {
        slug,
        sectionIndex: Number(body.sectionIndex),
        baseVersion: Number(body.baseVersion),
        baseBody: text(body.baseBody),
        newBody: text(body.newBody),
        reason: text(body.reason),
        by: member.key
      });
      if (!edited.ok) return edited.conflict ? fail(409, edited.error) : bad(edited.error);
      return NextResponse.json({ ok: true, version: edited.version });
    }

    return bad("unknown action");
  } catch (error) {
    return storeError(error);
  }
}
