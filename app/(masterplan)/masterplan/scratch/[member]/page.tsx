import Link from "next/link";
import { notFound } from "next/navigation";
import { AiPanel } from "../../../../../components/masterplan/AiPanel.tsx";
import { MpHead } from "../../../../../components/masterplan/MpHead.tsx";
import { ProposalList } from "../../../../../components/masterplan/ProposalList.tsx";
import { ScratchEditor } from "../../../../../components/masterplan/ScratchEditor.tsx";
import { MASTERPLAN_MEMBERS, memberByKey } from "../../../../../lib/masterplan-access.ts";
import { requireMasterplanMember } from "../../../../../lib/masterplan-auth.ts";
import { openProposalsFor, thaiDateTime } from "../../../../../lib/masterplan-format.ts";
import { aiSections, renderMarkdown } from "../../../../../lib/masterplan-markdown.ts";
import { getDoc, getScratch, listProposals } from "../../../../../lib/masterplan-store.ts";
import { MASTER_SLUG } from "../../../../../lib/masterplan.ts";

export const dynamic = "force-dynamic";

export default async function ScratchPage({ params }: { params: Promise<{ member: string }> }) {
  const me = await requireMasterplanMember();
  const { member: key } = await params;
  const owner = memberByKey(key);
  if (!owner) notFound();
  const own = owner.key === me.key;
  const [scratch, proposals, master] = await Promise.all([getScratch(owner.key), listProposals(), own ? getDoc(MASTER_SLUG) : Promise.resolve(null)]);
  const theirs = proposals.filter((p) => p.proposer === owner.key && (own || p.status !== "ร่าง"));

  return (
    <>
      <MpHead
        eyebrow="กระดาษทด"
        title={own ? "กระดาษทดของฉัน" : `กระดาษทดของ${owner.name}`}
        sub={own ? "พื้นที่ส่วนตัว จดได้เต็มที่ ไม่กระทบฉบับกลาง — คนอื่นเปิดอ่านได้แต่แก้ไม่ได้" : `อ่านอย่างเดียว · แก้ล่าสุด ${thaiDateTime(scratch?.updatedAt)}`}
      />
      <nav className="mp-tabs" aria-label="กระดาษทดของแต่ละคน">
        {MASTERPLAN_MEMBERS.map((m) => (
          <Link key={m.key} href={`/masterplan/scratch/${m.key}`} className={m.key === owner.key ? "is-active" : undefined} aria-current={m.key === owner.key ? "page" : undefined}>
            {m.key === me.key ? `${m.name} (ฉัน)` : m.name}
          </Link>
        ))}
      </nav>

      {own ? (
        <ScratchEditor memberKey={me.key} serverText={scratch?.markdown ?? ""} serverUpdatedAt={scratch?.updatedAt ?? null} />
      ) : scratch?.markdown.trim() ? (
        <div className="mp-md mp-readonly" dangerouslySetInnerHTML={{ __html: renderMarkdown(scratch.markdown) }} />
      ) : (
        <p className="mp-empty">{owner.name}ยังไม่ได้จดอะไร</p>
      )}

      {own ? (
        <div className="mp-block">
          <AiPanel
            memberKey={me.key}
            memberName={me.name}
            docTitle={master?.title}
            docText={master?.markdown}
            sections={master ? aiSections(master.markdown) : []}
            scratch={scratch?.markdown ?? ""}
            openProposals={openProposalsFor(proposals, me.key)}
            defaults={{ doc: false, scratch: true, proposals: true }}
          />
        </div>
      ) : null}

      <div className="mp-block">
        <h2 className="mp-h2">{own ? "ข้อเสนอของฉัน" : `ข้อเสนอของ${owner.name}`}</h2>
        <ProposalList proposals={theirs} me={me.key} editor={me.editor} />
      </div>
    </>
  );
}
