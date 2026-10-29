import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AiPanel } from "../../../../../components/masterplan/AiPanel.tsx";
import { DocView } from "../../../../../components/masterplan/DocView.tsx";
import { MpHead } from "../../../../../components/masterplan/MpHead.tsx";
import { ProductUpload } from "../../../../../components/masterplan/ProductUpload.tsx";
import { memberName } from "../../../../../lib/masterplan-access.ts";
import { requireMasterplanMember } from "../../../../../lib/masterplan-auth.ts";
import { openProposalsFor, thaiDateTime } from "../../../../../lib/masterplan-format.ts";
import { aiSections, docSectionViews } from "../../../../../lib/masterplan-markdown.ts";
import { PRODUCTS_SLUG } from "../../../../../lib/masterplan-products.ts";
import { getDoc, getScratch, listProposals } from "../../../../../lib/masterplan-store.ts";
import { DEFAULT_DOC_TITLES, MASTER_SLUG, REFERENCE_SLUGS } from "../../../../../lib/masterplan.ts";

// Reference docs (Mission A–D, research, roadmap). Editors (แชมป์ / ท้อป) get "แก้ตรง" per
// section (reason required → changelog); everyone keeps "เสนอแก้ตรงนี้". The products doc is
// generated from a StoreHub export — editors get an upload button that rebuilds it.

export const dynamic = "force-dynamic";

export default async function ReferenceDocPage({ params }: { params: Promise<{ slug: string }> }) {
  const member = await requireMasterplanMember();
  const { slug } = await params;
  if (slug === MASTER_SLUG) redirect("/masterplan/plan");
  if (!(REFERENCE_SLUGS as readonly string[]).includes(slug)) notFound();
  const [doc, scratch, proposals] = await Promise.all([getDoc(slug), getScratch(member.key), listProposals()]);
  const fallbackTitle = DEFAULT_DOC_TITLES[slug as keyof typeof DEFAULT_DOC_TITLES];
  const productUpload = slug === PRODUCTS_SLUG && member.editor ? <ProductUpload hasDoc={Boolean(doc)} /> : null;

  if (!doc) {
    return (
      <>
        <MpHead eyebrow="เอกสารอ้างอิง" title={fallbackTitle} sub="ยังไม่ได้นำเข้าเอกสารนี้" />
        {productUpload ?? (member.editor ? (
          <Link href="/masterplan/import" className="mp-btn mp-btn--primary">
            ไปหน้านำเข้าเอกสาร
          </Link>
        ) : null)}
      </>
    );
  }

  return (
    <>
      <MpHead
        eyebrow={member.editor ? "เอกสารอ้างอิง" : "เอกสารอ้างอิง · อ่านอย่างเดียว"}
        title={doc.title}
        sub={`เวอร์ชัน ${doc.version} · แก้ล่าสุด ${thaiDateTime(doc.updatedAt)} โดย ${memberName(doc.updatedBy)}`}
      />
      {productUpload}
      <details className="mp-fold">
        <summary>ให้ AI ช่วยคิดจากเอกสารนี้</summary>
        <AiPanel
          memberKey={member.key}
          memberName={member.name}
          docTitle={doc.title}
          docText={doc.markdown}
          sections={aiSections(doc.markdown)}
          scratch={scratch?.markdown ?? ""}
          openProposals={openProposalsFor(proposals, member.key)}
        />
      </details>
      <DocView slug={slug} docLabel={doc.title} version={doc.version} sections={docSectionViews(doc.markdown)} canEditDirect={member.editor} />
    </>
  );
}
