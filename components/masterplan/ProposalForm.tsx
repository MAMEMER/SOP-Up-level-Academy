"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Send, X } from "lucide-react";
import { MISSIONS, PROPOSAL_KINDS, validateProposalDraft, type Mission, type ProposalDraft, type ProposalKind } from "../../lib/masterplan.ts";
import { mpApi, useLocalDraft } from "../../lib/masterplan-client.ts";

// เสนอใหม่ / แก้ข้อเสนอ. Every keystroke is mirrored to localStorage (draftKey) so closing
// the tab never loses the text; the copy is cleared only after a successful save or an
// explicit "ล้างฟอร์ม".

export type ProposalFormValue = ProposalDraft;

export const EMPTY_PROPOSAL: ProposalFormValue = {
  title: "",
  missions: [],
  location: "",
  kind: "แก้",
  oldText: "",
  newText: "",
  reason: ""
};

export function ProposalForm({
  draftKey,
  initial,
  editId,
  onDone,
  onCancel,
  compact
}: {
  draftKey: string;
  initial?: Partial<ProposalFormValue>;
  /** when set, PATCHes this proposal instead of creating a new one */
  editId?: string;
  onDone?: () => void;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const start = { ...EMPTY_PROPOSAL, ...initial };
  const [value, setValue, clear, restored] = useLocalDraft<ProposalFormValue>(draftKey, start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const set = <K extends keyof ProposalFormValue>(field: K, next: ProposalFormValue[K]) => setValue((prev) => ({ ...prev, [field]: next }));
  const toggleMission = (mission: Mission) =>
    setValue((prev) => ({ ...prev, missions: prev.missions.includes(mission) ? prev.missions.filter((m) => m !== mission) : [...prev.missions, mission] }));

  async function save(submit: boolean) {
    setError(null);
    setSaved(null);
    const checked = validateProposalDraft(value);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setBusy(true);
    const result = editId
      ? await mpApi("proposals", "PATCH", { id: editId, action: "edit", draft: checked.value })
      : await mpApi<{ created: { code: string }[] }>("proposals", "POST", { items: [checked.value], submit });
    if (result.ok && editId && submit) {
      await mpApi("proposals", "PATCH", { id: editId, action: "status", to: "รอคุย" });
    }
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const code = !editId ? (result.data as { created?: { code: string }[] }).created?.[0]?.code : undefined;
    clear();
    setSaved(code ? `บันทึกแล้ว ${code}${submit ? " · ส่งเข้าวาระแล้ว" : " เป็นร่าง"}` : "บันทึกแล้ว");
    router.refresh();
    onDone?.();
  }

  const id = (name: string) => `${draftKey}-${name}`;

  return (
    <form
      className={`mp-form${compact ? " mp-form--compact" : ""}`}
      onSubmit={(event) => {
        event.preventDefault();
        void save(false);
      }}
    >
      {restored ? <p className="mp-note">กู้ข้อความที่พิมพ์ค้างไว้กลับมาแล้ว</p> : null}
      <label className="mp-field" htmlFor={id("title")}>
        <span>หัวข้อข้อเสนอ</span>
        <input id={id("title")} value={value.title} onChange={(e) => set("title", e.target.value)} maxLength={200} placeholder="สั้นๆ ว่าเสนออะไร" />
      </label>
      <div className="mp-field">
        <span>Mission</span>
        <div className="mp-chips" role="group" aria-label="Mission">
          {MISSIONS.map((mission) => (
            <button
              key={mission}
              type="button"
              className={`mp-chip${value.missions.includes(mission) ? " is-on" : ""}`}
              aria-pressed={value.missions.includes(mission)}
              onClick={() => toggleMission(mission)}
            >
              {mission === "ภาพรวม" ? mission : `Mission ${mission}`}
            </button>
          ))}
        </div>
      </div>
      <div className="mp-row2">
        <label className="mp-field" htmlFor={id("kind")}>
          <span>ประเภท</span>
          <select id={id("kind")} value={value.kind} onChange={(e) => set("kind", e.target.value as ProposalKind)}>
            {PROPOSAL_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
        <label className="mp-field" htmlFor={id("location")}>
          <span>ตำแหน่ง (หัวข้อ / รหัส KPI)</span>
          <input id={id("location")} value={value.location} onChange={(e) => set("location", e.target.value)} maxLength={200} />
        </label>
      </div>
      <label className="mp-field" htmlFor={id("old")}>
        <span>ข้อความเดิม {value.kind === "เพิ่ม" || value.kind === "คำถาม" ? "(ไม่บังคับ)" : "— ตัดให้เหลือเฉพาะส่วนที่จะแก้"}</span>
        <textarea id={id("old")} className="mp-textarea mp-textarea--old" value={value.oldText} onChange={(e) => set("oldText", e.target.value)} rows={compact ? 4 : 5} />
      </label>
      <label className="mp-field" htmlFor={id("new")}>
        <span>{value.kind === "คำถาม" ? "คำถาม / รายละเอียด" : value.kind === "ลบ" ? "ข้อความใหม่ (ว่างได้ถ้าลบทิ้ง)" : "ข้อความใหม่ที่เสนอ"}</span>
        <textarea id={id("new")} className="mp-textarea mp-textarea--new" value={value.newText} onChange={(e) => set("newText", e.target.value)} rows={compact ? 4 : 5} />
      </label>
      <label className="mp-field" htmlFor={id("reason")}>
        <span>เหตุผล</span>
        <textarea id={id("reason")} className="mp-textarea" value={value.reason} onChange={(e) => set("reason", e.target.value)} rows={2} />
      </label>
      {error ? (
        <p className="mp-error" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="mp-ok" role="status">
          {saved}
        </p>
      ) : null}
      <div className="mp-actions">
        <button type="button" className="mp-btn mp-btn--primary" disabled={busy} onClick={() => void save(true)}>
          <Send size={16} aria-hidden="true" /> {busy ? "กำลังบันทึก…" : "ส่งเข้าวาระ"}
        </button>
        <button type="submit" className="mp-btn" disabled={busy}>
          <Save size={16} aria-hidden="true" /> {editId ? "บันทึกการแก้" : "เก็บเป็นร่าง"}
        </button>
        {onCancel ? (
          <button type="button" className="mp-btn mp-btn--quiet" onClick={onCancel}>
            <X size={16} aria-hidden="true" /> ปิด
          </button>
        ) : null}
        <button
          type="button"
          className="mp-btn mp-btn--quiet"
          onClick={() => {
            if (window.confirm("ล้างข้อความในฟอร์มนี้ทั้งหมด?")) clear();
          }}
        >
          ล้างฟอร์ม
        </button>
      </div>
    </form>
  );
}
