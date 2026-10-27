"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Undo2 } from "lucide-react";
import { Diff } from "./AiPanel.tsx";
import { statusClass } from "./ProposalList.tsx";
import { MASTERPLAN_MEMBERS, memberName } from "../../lib/masterplan-access.ts";
import { mpApi, useLocalDraft } from "../../lib/masterplan-client.ts";
import { groupByMission, type MpMeeting, type MpProposal, type Verdict } from "../../lib/masterplan.ts";

// วาระวันนี้. A verdict is saved on the proposal the moment it's clicked (so nothing is lost
// if the meeting is cut short); "ปิดการคุยวันนี้" then snapshots today's decisions,
// attendees and summary into mp_meetings/{date}.

const VERDICT_BUTTONS: { verdict: Verdict; label: string; className: string }[] = [
  { verdict: "ลง", label: "ลง", className: "mp-verdict--yes" },
  { verdict: "ไม่ลง", label: "ไม่ลง", className: "mp-verdict--no" },
  { verdict: "พักไว้", label: "พักไว้", className: "mp-verdict--hold" }
];

export function MeetingBoard({
  date,
  me,
  agenda,
  decidedToday,
  meeting
}: {
  date: string;
  me: string;
  agenda: MpProposal[];
  decidedToday: MpProposal[];
  meeting: MpMeeting | null;
}) {
  const router = useRouter();
  const [attendees, setAttendees] = useLocalDraft<string[]>(`mp-meeting-${date}-attendees`, meeting?.attendees ?? [me]);
  const [summary, setSummary, clearSummary] = useLocalDraft<string>(`mp-meeting-${date}-summary`, meeting?.summary ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState<string | null>(null);

  async function close() {
    setBusy(true);
    setError(null);
    const res = await mpApi<{ decisions: number }>("meeting", "POST", { attendees, summary });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    clearSummary();
    setClosed(`ปิดการคุยแล้ว — บันทึก ${res.data.decisions} มติ`);
    router.refresh();
  }

  return (
    <>
      <div className="mp-block">
        <h2 className="mp-h2">ใครเข้าคุยวันนี้</h2>
        <div className="mp-chips" role="group" aria-label="ผู้เข้าคุย">
          {MASTERPLAN_MEMBERS.map((m) => {
            const on = attendees.includes(m.key);
            return (
              <button
                key={m.key}
                type="button"
                className={`mp-chip${on ? " is-on" : ""}`}
                aria-pressed={on}
                onClick={() => setAttendees((prev) => (prev.includes(m.key) ? prev.filter((k) => k !== m.key) : [...prev, m.key]))}
              >
                {m.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mp-block">
        <h2 className="mp-h2">
          วาระวันนี้ <span className="mp-count">{agenda.length}</span>
        </h2>
        {agenda.length === 0 ? <p className="mp-empty">ไม่มีข้อเสนอรอคุย</p> : null}
        {groupByMission(agenda).map((group) => (
          <div key={group.mission} className="mp-group">
            <p className="mp-group__label">{group.mission === "ภาพรวม" ? "ภาพรวม" : `Mission ${group.mission}`}</p>
            <ul className="mp-list">
              {group.items.map((proposal) => (
                <AgendaItem key={proposal.id} proposal={proposal} date={date} />
              ))}
            </ul>
          </div>
        ))}
      </div>

      {decidedToday.length > 0 ? (
        <div className="mp-block">
          <h2 className="mp-h2">ตัดสินแล้ววันนี้</h2>
          <ul className="mp-list">
            {decidedToday.map((proposal) => (
              <DecidedItem key={proposal.id} proposal={proposal} />
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mp-block">
        <h2 className="mp-h2">ปิดการคุย</h2>
        {meeting ? (
          <p className="mp-meta">
            ปิดไปแล้วโดย {memberName(meeting.closedBy)} ({meeting.decisions.length} มติ) — ปิดซ้ำได้ถ้ามีมติเพิ่ม
          </p>
        ) : null}
        <label className="mp-field">
          <span>สรุปสั้นๆ (ไม่บังคับ)</span>
          <textarea className="mp-textarea" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </label>
        {error ? (
          <p className="mp-error" role="alert">
            {error}
          </p>
        ) : null}
        {closed ? (
          <p className="mp-ok" role="status">
            {closed}
          </p>
        ) : null}
        <div className="mp-actions">
          <button type="button" className="mp-btn mp-btn--primary" disabled={busy || attendees.length === 0} onClick={() => void close()}>
            <CalendarCheck size={16} aria-hidden="true" /> {busy ? "กำลังบันทึก…" : "ปิดการคุยวันนี้"}
          </button>
        </div>
      </div>
    </>
  );
}

function AgendaItem({ proposal, date }: { proposal: MpProposal; date: string }) {
  const router = useRouter();
  const [note, setNote, clearNote] = useLocalDraft<string>(`mp-meeting-${date}-note-${proposal.id}`, "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(verdict: Verdict) {
    setBusy(true);
    setError(null);
    const res = await mpApi("proposals", "PATCH", { id: proposal.id, action: "status", to: verdict, note });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    clearNote();
    router.refresh();
  }

  return (
    <li className="mp-prop">
      <div className="mp-prop__top">
        <span className="mp-code">{proposal.code}</span>
        <span className="mp-meta mp-ellipsis">
          {memberName(proposal.proposer)} · {proposal.kind}
          {proposal.location ? ` · ${proposal.location}` : ""}
        </span>
      </div>
      <h3 className="mp-prop__title">{proposal.title}</h3>
      <Diff oldText={proposal.oldText} newText={proposal.newText} />
      {proposal.reason ? <p className="mp-reason">เหตุผล: {proposal.reason}</p> : null}
      <label className="mp-field">
        <span>หมายเหตุมติ</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="เช่น ลงแต่ปรับคำ / ขอข้อมูลเพิ่ม" />
      </label>
      {error ? (
        <p className="mp-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mp-verdicts" role="group" aria-label={`มติ ${proposal.code}`}>
        {VERDICT_BUTTONS.map((b) => (
          <button key={b.verdict} type="button" className={`mp-verdict ${b.className}`} disabled={busy} onClick={() => void decide(b.verdict)}>
            {b.label}
          </button>
        ))}
      </div>
    </li>
  );
}

function DecidedItem({ proposal }: { proposal: MpProposal }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const canUndo = proposal.status !== "ลงแล้ว";
  async function undo() {
    setBusy(true);
    const res = await mpApi("proposals", "PATCH", { id: proposal.id, action: "status", to: "รอคุย" });
    setBusy(false);
    if (res.ok) router.refresh();
  }
  return (
    <li className="mp-decided">
      <span className="mp-code">{proposal.code}</span>
      <span className={`mp-status ${statusClass(proposal.status)}`}>{proposal.status}</span>
      <span className="mp-decided__title mp-ellipsis">
        {proposal.title}
        {proposal.decisionNote ? ` — ${proposal.decisionNote}` : ""}
      </span>
      {canUndo ? (
        <button type="button" className="mp-tool" disabled={busy} onClick={() => void undo()}>
          <Undo2 size={15} aria-hidden="true" /> ย้อน
        </button>
      ) : null}
    </li>
  );
}
