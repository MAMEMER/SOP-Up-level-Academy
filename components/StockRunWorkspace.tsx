"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { uploadEvidenceImage } from "../lib/evidence-upload.ts";
import { storehubStocktakesUrl } from "../lib/weekly-stock-workflow.ts";
import {
  fetchRunsForStaff,
  saveRun,
  startNewRun,
  startRun,
  submitRun,
  type StockRunDraft
} from "../lib/stock-runs-store.ts";
import {
  canSubmitStockRun,
  defaultPeriodLabel,
  emptyCountLine,
  isStockRunActionable,
  lineDiff,
  sortStockRunsNewestFirst,
  stockRunStatusClass,
  stockRunStatusLabel,
  submitBlockReason,
  type StockCountLine,
  type StockRun,
  type StockRunKind
} from "../lib/stock-runs.ts";

function nowIso() {
  return new Date().toISOString();
}

function draftFromRun(run: StockRun): StockRunDraft {
  return {
    counts: run.counts?.length ? run.counts.map((line) => ({ ...line })) : [emptyCountLine()],
    checklistDone: { ...(run.checklistDone || {}) },
    lowStock: run.lowStock || "",
    refill: run.refill || "",
    reorder: run.reorder || "",
    note: run.note || "",
    evidence: [...(run.evidence || [])]
  };
}

const isImageUrl = (u: string) => /^https?:\/\/\S+\.(png|jpe?g|gif|webp|heic)/i.test(u) || /firebasestorage/.test(u);

export function StockRunWorkspace({
  kind,
  branch,
  staffCode,
  readOnly = false
}: {
  kind: StockRunKind;
  branch: string;
  staffCode: string | null;
  readOnly?: boolean;
}) {
  const [runs, setRuns] = useState<StockRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<StockRunDraft | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [link, setLink] = useState("");
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!staffCode) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = sortStockRunsNewestFirst(await fetchRunsForStaff(branch, staffCode, kind));
      setRuns(list);
      const active = list.find((run) => isStockRunActionable(run.status)) || null;
      setActiveId(active?.id ?? null);
      setDraft(active ? draftFromRun(active) : null);
    } catch {
      setError("โหลดงานตรวจนับไม่สำเร็จ ลองรีเฟรชอีกครั้ง");
    } finally {
      setLoading(false);
    }
  }, [branch, staffCode, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeRun = useMemo(() => runs.find((run) => run.id === activeId) || null, [runs, activeId]);
  const history = useMemo(() => runs.filter((run) => !isStockRunActionable(run.status)), [runs]);

  const persist = useCallback(
    async (next: StockRunDraft) => {
      if (!activeId || readOnly) return;
      setSaveState("saving");
      try {
        await saveRun(activeId, next);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    },
    [activeId, readOnly]
  );

  // Never lose the counter's work: autosave the draft ~800ms after the last change.
  const mutate = useCallback(
    (updater: (previous: StockRunDraft) => StockRunDraft) => {
      setDraft((previous) => {
        const base = previous || { counts: [emptyCountLine()], checklistDone: {}, lowStock: "", refill: "", reorder: "", note: "", evidence: [] };
        const next = updater(base);
        if (!readOnly && activeId) {
          if (timer.current) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => void persist(next), 800);
        }
        return next;
      });
    },
    [persist, readOnly, activeId]
  );

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  async function onStart() {
    if (readOnly) return;
    setBusy(true);
    setError(null);
    try {
      // งานที่แอดมินมอบหมายไว้ (assigned) → เริ่มงานนั้น; ไม่มี → สร้าง Run ใหม่เอง
      const assigned = runs.find((run) => run.status === "assigned");
      if (assigned) {
        await startRun(assigned.id);
      } else {
        await startNewRun({ kind, branch, periodLabel: defaultPeriodLabel(kind) });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เริ่มตรวจนับไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file || !draft) return;
    if (!file.type.startsWith("image/")) {
      setError("ไฟล์ต้องเป็นรูปภาพ");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("รูปต้องไม่เกิน 5MB");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const url = await uploadEvidenceImage(file);
      mutate((prev) => ({ ...prev, evidence: [...prev.evidence, url] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setUploading(false);
    }
  }

  function addLink() {
    const trimmed = link.trim();
    if (!trimmed) return;
    mutate((prev) => ({ ...prev, evidence: [...prev.evidence, trimmed] }));
    setLink("");
  }

  async function onSubmit() {
    if (!activeId || !draft) return;
    if (!canSubmitStockRun(draft)) {
      setError(submitBlockReason(draft));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (timer.current) window.clearTimeout(timer.current);
      await submitRun(activeId, draft);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งงานไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  if (!staffCode) {
    return (
      <section className="workflow-panel">
        <p className="owner-ops__empty">
          หน้านี้สำหรับพนักงานที่ตรวจนับ — บัญชีนี้ไม่ได้ผูกกับรหัสพนักงาน. แอดมินมอบหมายและตรวจงานตรวจนับได้ที่{" "}
          <Link href="/admin/stock-runs">ตรวจนับ Stock</Link>
        </p>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="workflow-panel">
        <p className="my-shift__loading">กำลังโหลดงานตรวจนับ…</p>
      </section>
    );
  }

  return (
    <section className="workflow-panel">
      {readOnly ? (
        <div className="trial-banner">
          <strong>มุมมองพนักงาน (อ่านอย่างเดียว)</strong>
          <span>ดูข้อมูลจริงได้ แต่แก้ไขไม่ได้</span>
        </div>
      ) : null}

      {activeRun && draft ? (
        <ActiveRunForm
          run={activeRun}
          draft={draft}
          readOnly={readOnly}
          busy={busy}
          uploading={uploading}
          saveState={saveState}
          error={error}
          link={link}
          setLink={setLink}
          onAddLink={addLink}
          onFile={onFile}
          onRemoveEvidence={(url) => mutate((prev) => ({ ...prev, evidence: prev.evidence.filter((u) => u !== url) }))}
          onToggleChecklist={(index) =>
            mutate((prev) => ({ ...prev, checklistDone: { ...prev.checklistDone, [index]: !prev.checklistDone[index] } }))
          }
          onCountChange={(rows) => mutate((prev) => ({ ...prev, counts: rows }))}
          onField={(field, value) => mutate((prev) => ({ ...prev, [field]: value }))}
          onSubmit={onSubmit}
        />
      ) : (
        <div className="stock-run-start">
          <div className="runner-status">
            <div>
              <span>งานตรวจนับรอบนี้</span>
              <strong>ยังไม่ได้เริ่ม</strong>
            </div>
          </div>
          <p className="owner-ops__empty">
            กด “เริ่มตรวจนับ” เพื่อสร้างงานตรวจนับใหม่ 1 ครั้ง แล้วกรอกผลการนับพร้อมแนบรูปหลักฐาน — ระบบจะบันทึกถาวรและส่งให้หัวหน้าตรวจ
          </p>
          {error ? <p className="input-status warning">{error}</p> : null}
          <button type="button" className="green-button" onClick={onStart} disabled={readOnly || busy}>
            {busy ? "กำลังเริ่ม…" : "เริ่มตรวจนับ"}
          </button>
        </div>
      )}

      {history.length ? <RunHistory history={history} /> : null}
    </section>
  );
}

function ActiveRunForm({
  run,
  draft,
  readOnly,
  busy,
  uploading,
  saveState,
  error,
  link,
  setLink,
  onAddLink,
  onFile,
  onRemoveEvidence,
  onToggleChecklist,
  onCountChange,
  onField,
  onSubmit
}: {
  run: StockRun;
  draft: StockRunDraft;
  readOnly: boolean;
  busy: boolean;
  uploading: boolean;
  saveState: "idle" | "saving" | "saved" | "error";
  error: string | null;
  link: string;
  setLink: (v: string) => void;
  onAddLink: () => void;
  onFile: (file: File | undefined) => void;
  onRemoveEvidence: (url: string) => void;
  onToggleChecklist: (index: string) => void;
  onCountChange: (rows: StockCountLine[]) => void;
  onField: (field: "lowStock" | "refill" | "reorder" | "note", value: string) => void;
  onSubmit: () => void;
}) {
  const canSubmit = canSubmitStockRun(draft);
  const blockReason = submitBlockReason(draft);
  const lastRevision = [...(run.approvals || [])].reverse().find((a) => a.status === "needs_revision");

  function updateRow(index: number, patch: Partial<StockCountLine>) {
    const rows = draft.counts.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onCountChange(rows);
  }
  function removeRow(index: number) {
    const rows = draft.counts.filter((_, i) => i !== index);
    onCountChange(rows.length ? rows : [emptyCountLine()]);
  }
  function addRow() {
    onCountChange([...draft.counts, emptyCountLine()]);
  }
  function parseNum(value: string): number | null {
    if (value.trim() === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  return (
    <>
      <div className="board-hero stock-run-head">
        <div>
          <p className="eyebrow">รอบ {run.periodLabel}</p>
          <h3>{run.checklist.title}</h3>
          <p>
            เริ่ม {run.startedAt ? run.startedAt.slice(0, 16).replace("T", " ") : "-"}
            {run.dueDate ? ` · กำหนดส่ง ${run.dueDate}` : ""}
            {run.submittedAt ? ` · ส่งล่าสุด ${run.submittedAt.slice(0, 16).replace("T", " ")}` : ""}
          </p>
        </div>
        <span className={`status-pill ${stockRunStatusClass[run.status]}`}>{stockRunStatusLabel[run.status]}</span>
      </div>

      {run.status === "needs_revision" && lastRevision ? (
        <section className="assignment-detail__revision soft-card">
          <p className="assign-work__label">หัวหน้าให้แก้ไข</p>
          <p>{lastRevision.note}</p>
        </section>
      ) : null}

      <a href={storehubStocktakesUrl} target="_blank" rel="noreferrer" className="detail-action-link">
        เปิด StoreHub Stock Take
      </a>

      {run.checklist.items.length ? (
        <div className="checklist-tick-list stock-run-checklist">
          {run.checklist.items.map((item, index) => {
            const key = String(index);
            const done = Boolean(draft.checklistDone[key]);
            return (
              <label key={key} className={done ? "tick-row done" : "tick-row"}>
                <input type="checkbox" checked={done} disabled={readOnly} onChange={() => onToggleChecklist(key)} />
                <span>{item}</span>
              </label>
            );
          })}
        </div>
      ) : null}

      <div className="stock-run-count">
        <p className="assign-work__label">รายการนับ · เทียบยอดระบบ (StoreHub) กับที่นับจริง</p>
        <div className="stock-run-count__head">
          <span>สินค้า</span>
          <span>ระบบ</span>
          <span>นับจริง</span>
          <span>ผลต่าง</span>
          <span />
        </div>
        {draft.counts.map((row, index) => {
          const diff = lineDiff(row);
          return (
            <div key={index} className="stock-run-count__row">
              <input
                type="text"
                value={row.name}
                disabled={readOnly}
                placeholder="เช่น Sleeve Dragon Shield ดำ"
                onChange={(e) => updateRow(index, { name: e.target.value })}
              />
              <input
                type="number"
                inputMode="numeric"
                value={row.system === null ? "" : String(row.system)}
                disabled={readOnly}
                onChange={(e) => updateRow(index, { system: parseNum(e.target.value) })}
              />
              <input
                type="number"
                inputMode="numeric"
                value={row.counted === null ? "" : String(row.counted)}
                disabled={readOnly}
                onChange={(e) => updateRow(index, { counted: parseNum(e.target.value) })}
              />
              <span className={diff !== null && diff !== 0 ? "stock-run-count__diff is-off" : "stock-run-count__diff"}>
                {diff === null ? "–" : diff > 0 ? `+${diff}` : String(diff)}
              </span>
              <button type="button" className="assign-work__del" disabled={readOnly} onClick={() => removeRow(index)}>
                ลบ
              </button>
            </div>
          );
        })}
        {!readOnly ? (
          <button type="button" className="btn-soft stock-run-count__add" onClick={addRow}>
            + เพิ่มรายการ
          </button>
        ) : null}
      </div>

      <div className="performance-input-form stock-run-notes">
        <label className="wide">
          รายการใกล้หมด
          <textarea
            value={draft.lowStock}
            disabled={readOnly}
            rows={2}
            placeholder="สินค้าที่เหลือน้อย ควรจับตา"
            onChange={(e) => onField("lowStock", e.target.value)}
          />
        </label>
        <label className="wide">
          รายการเติม
          <textarea
            value={draft.refill}
            disabled={readOnly}
            rows={2}
            placeholder="ของที่เติมหน้าร้าน/เข้าสต๊อกแล้ว"
            onChange={(e) => onField("refill", e.target.value)}
          />
        </label>
        <label className="wide">
          รายการสั่งเพิ่ม
          <textarea
            value={draft.reorder}
            disabled={readOnly}
            rows={2}
            placeholder="ของที่ต้องสั่งเข้าเพิ่ม"
            onChange={(e) => onField("reorder", e.target.value)}
          />
        </label>
        <label className="wide">
          หมายเหตุ
          <textarea
            value={draft.note}
            disabled={readOnly}
            rows={2}
            placeholder="อธิบายรายการที่ไม่ตรง / สาเหตุ"
            onChange={(e) => onField("note", e.target.value)}
          />
        </label>
      </div>

      <div className="evidence-input">
        <span className="assign-work__pick-label">รูปหลักฐาน (จำเป็น — แคปหน้า StoreHub หลังนับเสร็จ อย่างน้อย 1 รูป)</span>
        {!readOnly ? (
          <div className="evidence-input__row">
            <label className="evidence-input__file">
              {uploading ? "กำลังอัปโหลด…" : "แนบรูป"}
              <input type="file" accept="image/*" disabled={uploading} onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            <input
              className="evidence-input__link"
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onAddLink();
                }
              }}
              placeholder="หรือวางลิงก์รูป"
            />
            <button type="button" className="btn-soft" onClick={onAddLink} disabled={!link.trim()}>
              เพิ่มลิงก์
            </button>
          </div>
        ) : null}
        {draft.evidence.length ? (
          <ul className="assignment-detail__evidence">
            {draft.evidence.map((u) => (
              <li key={u}>
                {isImageUrl(u) ? (
                  <img className="evidence-input__preview" src={u} alt="หลักฐาน" />
                ) : (
                  <a href={u} target="_blank" rel="noreferrer">
                    {u}
                  </a>
                )}
                {!readOnly ? (
                  <button type="button" className="assign-work__del" onClick={() => onRemoveEvidence(u)}>
                    ลบ
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {error ? <p className="input-status warning">{error}</p> : null}
      {!canSubmit && !error ? <span className="evidence-input__hint">{blockReason}</span> : null}

      <div className="workflow-record-actions">
        <button type="button" className="green-button" onClick={onSubmit} disabled={readOnly || busy || uploading || !canSubmit}>
          {run.status === "needs_revision" ? "ส่งงานที่แก้แล้ว" : "ส่งงานตรวจนับ"}
        </button>
        <small className="stock-run-save">
          {saveState === "saving" ? "กำลังบันทึก…" : saveState === "saved" ? "บันทึกแล้ว" : saveState === "error" ? "บันทึกไม่สำเร็จ" : "แก้ไขแล้วระบบบันทึกอัตโนมัติ"}
        </small>
      </div>
    </>
  );
}

function RunHistory({ history }: { history: StockRun[] }) {
  return (
    <section className="owner-ops__panel stock-run-history">
      <div className="section-heading">
        <p className="eyebrow">ประวัติการตรวจนับ</p>
        <h3>รอบก่อนหน้า ({history.length})</h3>
      </div>
      <ul className="owner-ops__list">
        {history.map((run) => (
          <li key={run.id}>
            <strong>
              รอบ {run.periodLabel} · {stockRunStatusLabel[run.status]}
            </strong>
            <small>
              ส่ง {run.submittedAt ? run.submittedAt.slice(0, 16).replace("T", " ") : "-"}
              {run.approvals?.length ? ` · ตรวจ ${run.approvals.length} ครั้ง` : ""}
              {run.counts?.length ? ` · ${run.counts.filter((c) => c.name.trim()).length} รายการ` : ""}
            </small>
          </li>
        ))}
      </ul>
    </section>
  );
}
