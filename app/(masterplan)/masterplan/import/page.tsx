import { ImportForms } from "../../../../components/masterplan/ImportForms.tsx";
import { MpHead } from "../../../../components/masterplan/MpHead.tsx";
import { requireMasterplanMember } from "../../../../lib/masterplan-auth.ts";
import { listDocs } from "../../../../lib/masterplan-store.ts";
import { DEFAULT_DOC_TITLES, DOC_SLUGS } from "../../../../lib/masterplan.ts";

// Content never lives in git (the repo is public) — it arrives here. Editors only.

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const member = await requireMasterplanMember();
  if (!member.editor) {
    return (
      <>
        <MpHead eyebrow="นำเข้า" title="นำเข้าเอกสาร" sub="หน้านี้สำหรับแชมป์และท้อป (ผู้แก้ฉบับกลาง) เท่านั้น" />
      </>
    );
  }
  const docs = await listDocs();
  const targets = DOC_SLUGS.map((slug) => {
    const doc = docs.find((d) => d.slug === slug);
    return { slug, title: doc?.title ?? DEFAULT_DOC_TITLES[slug], version: doc?.version ?? 0 };
  });
  return (
    <>
      <MpHead eyebrow="นำเข้า" title="นำเข้าเอกสาร งาน และตัวชี้วัด" sub="วางหรืออัปโหลดไฟล์ .md — แทนที่ทั้งเอกสาร ขึ้นเวอร์ชันใหม่ และลงประวัติว่า &ldquo;นำเข้า&rdquo;" />
      <ImportForms targets={targets} />
    </>
  );
}
