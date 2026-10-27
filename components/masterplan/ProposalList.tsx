"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Send, Trash2, Undo2 } from "lucide-react";
import { Diff } from "./AiPanel.tsx";
import { ProposalForm } from "./ProposalForm.tsx";
import { canDeleteProposal, canEditProposal, canTransition, type MpProposal } from "../../lib/masterplan.ts";
import { memberName } from "../../lib/masterplan-access.ts";
import { mpApi } from "../../lib/masterplan-client.ts";

// Proposal rows (hairline-separated, no cards). Owner actions on own ร่าง / รอคุย:
// แก้, ส่งเข้าวาระ (ร่าง→รอคุย), ดึงกลับเป็นร่าง, ลบร่าง. พักไว้ → anyone can bring it back.

export function statusClass(status: string): string {
  return (
    {
      ร่าง: "is-draft",
      รอคุย: "is-waiting",
      ลง: "is-yes",
      ไม่ลง: "is-no",
      พักไว้: "is-hold",
      ลงแล้ว: "is-done"
    } as Record<string, string>
  )[status] ?? "";
}

export function ProposalList({ proposals, me, editor }: { proposals: MpProposal[]; me: string; editor: boolean }) {
  if (proposals.length === 0) return <p className="mp-empty">ยังไม่มีข้อเสนอในมุมมองนี้</p>;
  return (
    <ul className="mp-list">
      {proposals.map((proposal) => (
        <ProposalRow key={proposal.id} proposal={proposal} me={me} editor={editor} />
      ))}
    </ul>
  );
}

function ProposalRow({ proposal, me, editor }: { proposal: MpProposal; me: string; editor: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actor = { key: me, editor };

  async function move(to: MpProposal["status"]) {
    setBusy(true);
    setError(null);
    const res = await mpApi("proposals", "PATCH", { id: proposal.id, action: "status", to });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  async function remove() {
    if (!window.confirm(`ลบร่าง ${proposal.code}?`)) return;
    setBusy(true);
    const res = await mpApi("proposals", "DELETE", { id: proposal.id });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  return (
    <li className="mp-prop" id={proposal.code}>
      <div className="mp-prop__top">
        <span className="mp-code">{proposal.code}</span>
        <span className={`mp-status ${statusClass(proposal.status)}`}>{proposal.status}</span>
        <span className="mp-meta mp-ellipsis">
          {memberName(proposal.proposer)}
          {proposal.via === "ai-token" ? " (ผ่าน AI)" : ""} · {proposal.kind} · {proposal.missions.map((m) => (m === "ภาพรวม" ? m : `M-${m}`)).join(" ")}
        </span>
      </div>
      <h3 className="mp-prop__title">{proposal.title}</h3>
      {proposal.location ? <p className="mp-meta mp-ellipsis">ตำแหน่ง: {proposal.location}</p> : null}
      {editing ? (
        <ProposalForm
          compact
          draftKey={`mp-edit-proposal-${proposal.id}`}
          editId={proposal.id}
          initial={{
            title: proposal.title,
            missions: proposal.missions,
            location: proposal.location,
            kind: proposal.kind,
            oldText: proposal.oldText,
            newText: proposal.newText,
            reason: proposal.reason
          }}
          onCancel={() => setEditing(false)}
          onDone={() => setEditing(false)}
        />
      ) : (
        <>
          <Diff oldText={proposal.oldText} newText={proposal.newText} />
          {proposal.reason ? <p className="mp-reason">เหตุผล: {proposal.reason}</p> : null}
          {proposal.decisionNote ? <p className="mp-reason">มติ{proposal.decidedOn ? ` (${proposal.decidedOn})` : ""}: {proposal.decisionNote}</p> : null}
        </>
      )}
      {error ? (
        <p className="mp-error" role="alert">
          {error}
        </p>
      ) : null}
      {!editing ? (
        <div className="mp-prop__tools">
          {canTransition(proposal, "รอคุย", actor) && proposal.status === "ร่าง" ? (
            <button type="button" className="mp-tool mp-tool--strong" disabled={busy} onClick={() => void move("รอคุย")}>
              <Send size={15} aria-hidden="true" /> ส่งเข้าวาระ
            </button>
          ) : null}
          {proposal.status === "พักไว้" ? (
            <button type="button" className="mp-tool" disabled={busy} onClick={() => void move("รอคุย")}>
              <Undo2 size={15} aria-hidden="true" /> นำกลับเข้าวาระ
            </button>
          ) : null}
          {canEditProposal(proposal, actor) ? (
            <button type="button" className="mp-tool" onClick={() => setEditing(true)}>
              <Pencil size={15} aria-hidden="true" /> แก้
            </button>
          ) : null}
          {proposal.status === "รอคุย" && canTransition(proposal, "ร่าง", actor) ? (
            <button type="button" className="mp-tool" disabled={busy} onClick={() => void move("ร่าง")}>
              <Undo2 size={15} aria-hidden="true" /> ดึงกลับเป็นร่าง
            </button>
          ) : null}
          {canDeleteProposal(proposal, actor) ? (
            <button type="button" className="mp-tool mp-tool--danger" disabled={busy} onClick={() => void remove()}>
              <Trash2 size={15} aria-hidden="true" /> ลบร่าง
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
