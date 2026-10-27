import Link from "next/link";
import { AiPanel } from "../../../../components/masterplan/AiPanel.tsx";
import { DocView } from "../../../../components/masterplan/DocView.tsx";
import { MpHead } from "../../../../components/masterplan/MpHead.tsx";
import { memberName } from "../../../../lib/masterplan-access.ts";
import { requireMasterplanMember } from "../../../../lib/masterplan-auth.ts";
import { openProposalsFor, thaiDateTime } from "../../../../lib/masterplan-format.ts";
import { aiSections, docSectionViews } from "../../../../lib/masterplan-markdown.ts";
import { getDoc, getScratch, listProposals } from "../../../../lib/masterplan-store.ts";
import { MASTER_SLUG } from "../../../../lib/masterplan.ts";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const member = await requireMasterplanMember();
  const [doc, scratch, proposals] = await Promise.all([getDoc(MASTER_SLUG), getScratch(member.key), listProposals()]);

  if (!doc) {
    return (
      <>
        <MpHead eyebrow="ฉบับกลาง" title="ยังไม่มีฉบับกลาง" sub="ฉบับกลางจะขึ้นที่นี่หลังนำเข้าเอกสารครั้งแรก" />
        {member.editor ? (
          <Link href="/masterplan/import" className="mp-btn mp-btn--primary">
            ไปหน้านำเข้าเอกสาร
          </Link>
        ) : (
          <p className="mp-sub">รอแชมป์หรือท้อปนำเข้าเอกสาร</p>
        )}
      </>
    );
  }

  return (
    <>
      <MpHead
        eyebrow="ฉบับกลาง"
        title={doc.title}
        sub={
          <>
            เวอร์ชัน {doc.version} · แก้ล่าสุด {thaiDateTime(doc.updatedAt)} โดย {memberName(doc.updatedBy)} ·{" "}
            <Link href="/masterplan/history">ดูประวัติ</Link>
          </>
        }
      />
      <details className="mp-fold">
        <summary>ให้ AI ช่วยคิด (คัดลอก / วางคำตอบ)</summary>
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
      <DocView slug={MASTER_SLUG} docLabel={doc.title} version={doc.version} sections={docSectionViews(doc.markdown)} canEditDirect={member.editor} />
    </>
  );
}
