"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp } from "lucide-react";
import { Diff } from "./AiPanel.tsx";
import { memberName } from "../../lib/masterplan-access.ts";
import { mpApi, useLocalDraft } from "../../lib/masterplan-client.ts";
import { contextAround, countOccurrences, findSectionIndex, splitSections, type MpProposal } from "../../lib/masterplan.ts";
import { plainHeading } from "../../lib/masterplan-markdown.ts";

// รอนำเข้าฉบับกลาง (status ลง). Editors click "นำเข้า":
//  - oldText found exactly once → preview in context, confirm → server swaps it
//  - otherwise → edit the relevant section by hand (prefilled), save
//  - or "ไม่ต้องแก้เนื้อหา" (a question that got answered, etc.)
// Every path: version +1 (except "none"), status ลงแล้ว, changelog line.

export function ApplyQueue({
  items,
  master,
  editor
}: {
  items: MpProposal[];
  master: { markdown: string; version: number } | null;
  editor: boolean;
}) {
  if (items.length === 0) return <p className="mp-empty">ไม่มีข้อเสนอที่รอนำเข้า</p>;
  return (
    <ul className="mp-list">
      {items.map((proposal) => (
        <ApplyItem key={proposal.id} proposal={proposal} master={master} editor={editor} />
      ))}
    </ul>
  );
}

function ApplyItem({ proposal, master, editor }: { proposal: MpProposal; master: { markdown: string; version: number } | null; editor: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const markdown = master?.markdown ?? "";
  const occurrences = proposal.oldText ? countOccurrences(markdown, proposal.oldText) : 0;
  const exact = occurrences === 1;
  const sections = useMemo(() => splitSections(markdown), [markdown]);
  const guess = useMemo(() => findSectionIndex(markdown, proposal.location, proposal.oldText), [markdown, proposal.location, proposal.oldText]);
  const [sectionIndex, setSectionIndex] = useState(guess);
  const baseBody = sections[sectionIndex]?.body ?? "";
  const [manual, setManual, clearManual] = useLocalDraft<{ index: number; body: string } | null>(`mp-apply-${proposal.id}-v${master?.version ?? 0}`, null);
  const manualBody = manual && manual.index === sectionIndex ? manual.body : baseBody;
  const context = exact ? contextAround(markdown, proposal.oldText) : null;

  async function apply(mode: "replace" | "section" | "none") {
    if (!master && mode !== "none") return;
    setBusy(true);
    setError(null);
    const res = await mpApi("apply", "POST", {
      proposalId: proposal.id,
      mode,
      baseVersion: master?.version ?? 0,
      sectionIndex,
      baseBody,
      newBody: manualBody
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    clearManual();
    router.refresh();
  }

  return (
    <li className="mp-prop">
      <div className="mp-prop__top">
        <span className="mp-code">{proposal.code}</span>
        <span className="mp-meta mp-ellipsis">
          มติ {proposal.decidedOn ?? "-"} · {memberName(proposal.proposer)} · {proposal.kind}
          {proposal.location ? ` · ${proposal.location}` : ""}
        </span>
      </div>
      <h3 className="mp-prop__title">{proposal.title}</h3>
      {proposal.decisionNote ? <p className="mp-reason">หมายเหตุมติ: {proposal.decisionNote}</p> : null}
      {!open ? (
        <>
          <Diff oldText={proposal.oldText} newText={proposal.newText} />
          {editor ? (
            <div className="mp-prop__tools">
              <button type="button" className="mp-tool mp-tool--strong" onClick={() => setOpen(true)} disabled={!master}>
                <FileUp size={15} aria-hidden="true" /> นำเข้า
              </button>
              {!master ? <span className="mp-meta">ยังไม่มีฉบับกลาง — นำเข้าเอกสารก่อน</span> : null}
            </div>
          ) : (
            <p className="mp-meta">รอแชมป์หรือท้อปนำเข้าฉบับกลาง</p>
          )}
        </>
      ) : exact && context ? (
        <div className="mp-inline">
          <p className="mp-inline__title">พบข้อความเดิม 1 ที่ — ตรวจแล้วกดยืนยัน</p>
          <div className="mp-preview">
            <span className="mp-preview__ctx">{context.before}</span>
            <del className="mp-preview__old">{proposal.oldText}</del>
            <ins className="mp-preview__new">{proposal.newText}</ins>
            <span className="mp-preview__ctx">{context.after}</span>
          </div>
          {error ? (
            <p className="mp-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mp-actions">
            <button type="button" className="mp-btn mp-btn--primary" disabled={busy} onClick={() => void apply("replace")}>
              {busy ? "กำลังนำเข้า…" : "ยืนยันนำเข้า"}
            </button>
            <button type="button" className="mp-btn mp-btn--quiet" onClick={() => setOpen(false)}>
              ปิด
            </button>
          </div>
        </div>
      ) : (
        <div className="mp-inline">
          <p className="mp-inline__title">
            {!proposal.oldText.trim()
              ? "ข้อเสนอนี้ไม่มีข้อความเดิม — เลือกหัวข้อแล้วแก้ด้วยมือ"
              : occurrences === 0
                ? "ไม่พบข้อความเดิมในฉบับกลาง (อาจถูกแก้ไปแล้ว) — แก้ด้วยมือ"
                : `ข้อความเดิมพบ ${occurrences} ที่ — แก้ด้วยมือ`}
          </p>
          <Diff oldText={proposal.oldText} newText={proposal.newText} />
          <label className="mp-field">
            <span>หัวข้อที่จะแก้</span>
            <select value={sectionIndex} onChange={(e) => setSectionIndex(Number(e.target.value))}>
              {sections.map((s) => (
                <option key={s.index} value={s.index}>
                  {s.index === 0 ? "(ส่วนนำ ก่อนหัวข้อแรก)" : `${"· ".repeat(Math.max(0, s.level - 1))}${plainHeading(s.heading)}`}
                </option>
              ))}
            </select>
          </label>
          <label className="mp-field">
            <span>เนื้อหาหัวข้อนี้หลังแก้ (Markdown)</span>
            <textarea
              className="mp-textarea mp-textarea--tall"
              rows={12}
              value={manualBody}
              onChange={(e) => setManual({ index: sectionIndex, body: e.target.value })}
            />
          </label>
          {error ? (
            <p className="mp-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mp-actions">
            <button type="button" className="mp-btn mp-btn--primary" disabled={busy || manualBody === baseBody} onClick={() => void apply("section")}>
              {busy ? "กำลังนำเข้า…" : "บันทึกและนำเข้า"}
            </button>
            <button type="button" className="mp-btn" disabled={busy} onClick={() => void apply("none")}>
              ไม่ต้องแก้เนื้อหา
            </button>
            <button type="button" className="mp-btn mp-btn--quiet" onClick={() => setOpen(false)}>
              ปิด
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
