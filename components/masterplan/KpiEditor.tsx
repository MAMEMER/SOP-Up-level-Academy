"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { ProposalForm } from "./ProposalForm.tsx";
import { mpApi, useLocalDraft } from "../../lib/masterplan-client.ts";
import { KPI_EFFORTS, KPI_STATUSES, type KpiEffort, type KpiStatus, type MpKpi } from "../../lib/masterplan-kpi.ts";

// Tools under a KPI: "แก้สถานะ" (status / baseline / gaps / next steps / data sources, with
// a reason that goes to the history) and "เสนอแก้ตรงนี้" / "เสนอเป้า" (a proposal prefilled
// with location = KPI code). The target is never editable here.

type StepRow = { action: string; who: string; effort: KpiEffort; done?: boolean };
type SourceRow = { system: string; fields: string; coverage: string };
type Draft = {
  status: KpiStatus;
  hasBaseline: boolean;
  baseline: { value: string; period: string; branch: string; method: string; n: string };
  gaps: string;
  steps: StepRow[];
  sources: SourceRow[];
  reason: string;
};

function initialDraft(kpi: MpKpi): Draft {
  return {
    status: kpi.status,
    hasBaseline: kpi.baseline !== null,
    baseline: {
      value: kpi.baseline ? String(kpi.baseline.value) : "",
      period: kpi.baseline?.period ?? "",
      branch: kpi.baseline?.branch ?? "",
      method: kpi.baseline?.method ?? "",
      n: kpi.baseline?.n !== undefined ? String(kpi.baseline.n) : ""
    },
    gaps: kpi.gaps.join("\n"),
    steps: kpi.nextSteps.map((s) => ({ action: s.action, who: s.who, effort: s.effort, done: s.done })),
    sources: kpi.dataSources.map((s) => ({ ...s })),
    reason: ""
  };
}

const NUMBER_RE = /^-?\d+(\.\d+)?$/;

function toPatch(draft: Draft) {
  const b = draft.baseline;
  const value = b.value.trim();
  return {
    status: draft.status,
    baseline: draft.hasBaseline
      ? {
          value: NUMBER_RE.test(value.replace(/,/g, "")) ? Number(value.replace(/,/g, "")) : value,
          period: b.period,
          branch: b.branch,
          method: b.method,
          ...(b.n.trim() ? { n: Number(b.n) } : {})
        }
      : null,
    gaps: draft.gaps.split("\n").map((g) => g.trim()).filter(Boolean),
    nextSteps: draft.steps.filter((s) => s.action.trim()),
    dataSources: draft.sources.filter((s) => s.system.trim())
  };
}

export function KpiTools({ kpi }: { kpi: MpKpi }) {
  const [mode, setMode] = useState<"none" | "edit" | "propose" | "target">("none");
  const toggle = (next: typeof mode) => setMode(mode === next ? "none" : next);
  return (
    <div className="mp-ktools">
      <div className="mp-sec__tools">
        <button type="button" className="mp-tool mp-tool--strong" aria-expanded={mode === "edit"} onClick={() => toggle("edit")}>
          <Pencil size={15} aria-hidden="true" /> แก้สถานะ
        </button>
        <button type="button" className="mp-tool" aria-expanded={mode === "propose"} onClick={() => toggle("propose")}>
          <Lightbulb size={15} aria-hidden="true" /> เสนอแก้ตรงนี้
        </button>
        <button type="button" className="mp-tool" aria-expanded={mode === "target"} onClick={() => toggle("target")}>
          <Target size={15} aria-hidden="true" /> เสนอเป้า
        </button>
      </div>
      {mode === "edit" ? <KpiEditForm kpi={kpi} onClose={() => setMode("none")} /> : null}
      {mode === "propose" || mode === "target" ? (
        <div className="mp-inline">
          <p className="mp-inline__title">
            {mode === "target" ? "เสนอเป้า" : "เสนอแก้"} &ldquo;{kpi.code}&rdquo;
          </p>
          <ProposalForm
            key={mode}
            compact
            draftKey={`mp-propose-kpi-${kpi.code}-${mode}`}
            initial={{ location: kpi.code, missions: [kpi.mission], kind: mode === "target" ? "ตั้งเป้า" : "แก้", oldText: mode === "target" ? "" : kpi.name, newText: "" }}
            onCancel={() => setMode("none")}
            onDone={() => setMode("none")}
          />
        </div>
      ) : null}
    </div>
  );
}

function KpiEditForm({ kpi, onClose }: { kpi: MpKpi; onClose: () => void }) {
  const router = useRouter();
  const [draft, setDraft, clear, restored] = useLocalDraft<Draft>(`mp-kpi-edit-${kpi.code}-${kpi.updatedAt}`, initialDraft(kpi));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(field: K, value: Draft[K]) => setDraft((prev) => ({ ...prev, [field]: value }));
  const setBase = (field: keyof Draft["baseline"], value: string) => setDraft((prev) => ({ ...prev, baseline: { ...prev.baseline, [field]: value } }));
  const setStep = (i: number, patch: Partial<StepRow>) => setDraft((prev) => ({ ...prev, steps: prev.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const setSource = (i: number, patch: Partial<SourceRow>) => setDraft((prev) => ({ ...prev, sources: prev.sources.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));

  async function save() {
    if (!draft.reason.trim()) {
      setError("ใส่เหตุผลที่แก้ (ลงประวัติ)");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await mpApi("kpis", "PATCH", { code: kpi.code, action: "edit", patch: toPatch(draft), reason: draft.reason });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    clear();
    onClose();
    router.refresh();
  }

  return (
    <form
      className="mp-form mp-inline"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p className="mp-inline__title">แก้สถานะ {kpi.code}</p>
      {restored ? <p className="mp-note">กู้ข้อความที่พิมพ์ค้างไว้กลับมาแล้ว</p> : null}
      <div className="mp-field">
        <span>สถานะการวัด</span>
        <div className="mp-chips" role="group" aria-label="สถานะการวัด">
          {KPI_STATUSES.map((s) => (
            <button key={s} type="button" className={`mp-chip${draft.status === s ? " is-on" : ""}`} aria-pressed={draft.status === s} onClick={() => set("status", s)}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <fieldset className="mp-kfield">
        <legend>ค่าฐาน</legend>
        <label className="mp-check">
          <input type="checkbox" checked={draft.hasBaseline} onChange={(e) => set("hasBaseline", e.target.checked)} /> มีค่าฐานแล้ว
        </label>
        {draft.hasBaseline ? (
          <div className="mp-kgrid">
            <label className="mp-field">
              <span>ค่า{kpi.unit ? ` (${kpi.unit})` : ""}</span>
              <input value={draft.baseline.value} onChange={(e) => setBase("value", e.target.value)} inputMode="decimal" />
            </label>
            <label className="mp-field">
              <span>ช่วงเวลา</span>
              <input value={draft.baseline.period} onChange={(e) => setBase("period", e.target.value)} placeholder="เช่น 2026-Q3" />
            </label>
            <label className="mp-field">
              <span>สาขา</span>
              <input value={draft.baseline.branch} onChange={(e) => setBase("branch", e.target.value)} placeholder="เว้นว่าง = รวม" />
            </label>
            <label className="mp-field">
              <span>จำนวนตัวอย่าง (n)</span>
              <input value={draft.baseline.n} onChange={(e) => setBase("n", e.target.value)} inputMode="numeric" />
            </label>
            <label className="mp-field mp-kgrid__wide">
              <span>วิธีวัด</span>
              <textarea className="mp-textarea" rows={2} value={draft.baseline.method} onChange={(e) => setBase("method", e.target.value)} />
            </label>
          </div>
        ) : null}
      </fieldset>

      <label className="mp-field">
        <span>ช่องว่าง (บรรทัดละข้อ)</span>
        <textarea className="mp-textarea" rows={3} value={draft.gaps} onChange={(e) => set("gaps", e.target.value)} />
      </label>

      <fieldset className="mp-kfield">
        <legend>สิ่งที่ต้องทำต่อ</legend>
        {draft.steps.map((step, i) => (
          <div key={i} className="mp-krow mp-krow--step">
            <label className="mp-field mp-krow__main">
              <span>สิ่งที่ต้องทำ</span>
              <input value={step.action} onChange={(e) => setStep(i, { action: e.target.value })} />
            </label>
            <label className="mp-field">
              <span>ใคร</span>
              <input value={step.who} onChange={(e) => setStep(i, { who: e.target.value })} />
            </label>
            <label className="mp-field">
              <span>ขนาดงาน</span>
              <select value={step.effort} onChange={(e) => setStep(i, { effort: e.target.value as KpiEffort })}>
                {KPI_EFFORTS.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="mp-tool mp-tool--danger mp-krow__del" onClick={() => set("steps", draft.steps.filter((_, j) => j !== i))}>
              <Trash2 size={15} aria-hidden="true" /> ลบ
            </button>
          </div>
        ))}
        <button type="button" className="mp-tool" onClick={() => set("steps", [...draft.steps, { action: "", who: "", effort: "M" }])}>
          <Plus size={15} aria-hidden="true" /> เพิ่มสิ่งที่ต้องทำ
        </button>
      </fieldset>

      <fieldset className="mp-kfield">
        <legend>แหล่งข้อมูล</legend>
        {draft.sources.map((source, i) => (
          <div key={i} className="mp-krow">
            <label className="mp-field">
              <span>ระบบ</span>
              <input value={source.system} onChange={(e) => setSource(i, { system: e.target.value })} />
            </label>
            <label className="mp-field mp-krow__main">
              <span>ช่องข้อมูล</span>
              <input value={source.fields} onChange={(e) => setSource(i, { fields: e.target.value })} />
            </label>
            <label className="mp-field">
              <span>ครอบคลุม</span>
              <input value={source.coverage} onChange={(e) => setSource(i, { coverage: e.target.value })} />
            </label>
            <button type="button" className="mp-tool mp-tool--danger mp-krow__del" onClick={() => set("sources", draft.sources.filter((_, j) => j !== i))}>
              <Trash2 size={15} aria-hidden="true" /> ลบ
            </button>
          </div>
        ))}
        <button type="button" className="mp-tool" onClick={() => set("sources", [...draft.sources, { system: "", fields: "", coverage: "" }])}>
          <Plus size={15} aria-hidden="true" /> เพิ่มแหล่งข้อมูล
        </button>
      </fieldset>

      <p className="mp-meta">เป้า: แก้ตรงนี้ไม่ได้ — ตั้งผ่านข้อเสนอ (เสนอเป้า) เท่านั้น</p>
      <label className="mp-field">
        <span>เหตุผลที่แก้ (ลงประวัติ)</span>
        <input value={draft.reason} onChange={(e) => set("reason", e.target.value)} maxLength={2000} required />
      </label>
      {error ? (
        <p className="mp-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mp-actions">
        <button type="submit" className="mp-btn mp-btn--primary" disabled={busy}>
          {busy ? "กำลังบันทึก…" : "บันทึก"}
        </button>
        <button
          type="button"
          className="mp-btn mp-btn--quiet"
          onClick={() => {
            clear();
            onClose();
          }}
        >
          ยกเลิก
        </button>
      </div>
    </form>
  );
}
