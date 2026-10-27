import Link from "next/link";
import { AiPanel } from "../../../../components/masterplan/AiPanel.tsx";
import { MpHead } from "../../../../components/masterplan/MpHead.tsx";
import { NewProposal } from "../../../../components/masterplan/NewProposal.tsx";
import { ProposalList } from "../../../../components/masterplan/ProposalList.tsx";
import { MASTERPLAN_MEMBERS } from "../../../../lib/masterplan-access.ts";
import { requireMasterplanMember } from "../../../../lib/masterplan-auth.ts";
import { openProposalsFor } from "../../../../lib/masterplan-format.ts";
import { getScratch, listProposals } from "../../../../lib/masterplan-store.ts";
import { MISSIONS, PROPOSAL_STATUSES, isMission, isProposalStatus } from "../../../../lib/masterplan.ts";

export const dynamic = "force-dynamic";

type Search = { status?: string; mission?: string; by?: string };

function href(current: Search, patch: Search): string {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
  const query = params.toString();
  return `/masterplan/proposals${query ? `?${query}` : ""}`;
}

export default async function ProposalsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const member = await requireMasterplanMember();
  const search = await searchParams;
  const [all, scratch] = await Promise.all([listProposals(), getScratch(member.key)]);
  // other people's ร่าง are private until they send them to the agenda
  const visible = all.filter((p) => p.status !== "ร่าง" || p.proposer === member.key);
  const status = isProposalStatus(search.status) ? search.status : "";
  const mission = isMission(search.mission) ? search.mission : "";
  const by = MASTERPLAN_MEMBERS.some((m) => m.key === search.by) ? (search.by as string) : "";
  const filtered = visible.filter(
    (p) => (!status || p.status === status) && (!mission || p.missions.includes(mission)) && (!by || p.proposer === by)
  );
  const current: Search = { status, mission, by };
  const count = (s: string) => visible.filter((p) => p.status === s).length;

  return (
    <>
      <MpHead eyebrow="ข้อเสนอ" title="ข้อเสนอแก้ฉบับกลาง" sub="ร่าง → ส่งเข้าวาระ (รอคุย) → คุยวันนี้ตัดสิน ลง / ไม่ลง / พักไว้ → นำเข้าฉบับกลาง (ลงแล้ว)" />

      <NewProposal />

      <details className="mp-fold">
        <summary>ให้ AI ช่วยร่างข้อเสนอ</summary>
        <AiPanel
          memberKey={member.key}
          memberName={member.name}
          scratch={scratch?.markdown ?? ""}
          openProposals={openProposalsFor(all, member.key)}
          defaults={{ doc: false, scratch: true, proposals: true }}
        />
      </details>

      <div className="mp-filters" aria-label="กรองข้อเสนอ">
        <div className="mp-filter">
          <span className="mp-filter__label">สถานะ</span>
          <Link href={href(current, { status: "" })} className={!status ? "is-active" : undefined}>
            ทั้งหมด
          </Link>
          {PROPOSAL_STATUSES.map((s) => (
            <Link key={s} href={href(current, { status: s })} className={status === s ? "is-active" : undefined}>
              {s} <span className="mp-count">{count(s)}</span>
            </Link>
          ))}
        </div>
        <div className="mp-filter">
          <span className="mp-filter__label">Mission</span>
          <Link href={href(current, { mission: "" })} className={!mission ? "is-active" : undefined}>
            ทั้งหมด
          </Link>
          {MISSIONS.map((m) => (
            <Link key={m} href={href(current, { mission: m })} className={mission === m ? "is-active" : undefined}>
              {m}
            </Link>
          ))}
        </div>
        <div className="mp-filter">
          <span className="mp-filter__label">คนเสนอ</span>
          <Link href={href(current, { by: "" })} className={!by ? "is-active" : undefined}>
            ทุกคน
          </Link>
          {MASTERPLAN_MEMBERS.map((m) => (
            <Link key={m.key} href={href(current, { by: m.key })} className={by === m.key ? "is-active" : undefined}>
              {m.name}
            </Link>
          ))}
        </div>
      </div>

      <p className="mp-meta">แสดง {filtered.length} จาก {visible.length} ข้อเสนอ</p>
      <ProposalList proposals={filtered} me={member.key} editor={member.editor} />
    </>
  );
}
