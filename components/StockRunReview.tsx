"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { displayNameFor } from "../lib/employee-directory.ts";
import { approveRun, deleteRun, fetchRunById, requestRunRevision } from "../lib/stock-runs-store.ts";
import {
  hasDiscrepancy,
  lineDiff,
  meaningfulCountLines,
  stockRunKindLabel,
  stockRunStatusClass,
  stockRunStatusLabel,
  type StockRun
} from "../lib/stock-runs.ts";

const isImageUrl = (u: string) => /^https?:\/\/\S+\.(png|jpe?g|gif|webp|heic)/i.test(u) || /firebasestorage/.test(u);

// Owner review page for one Stock Run: read the counts + evidence the staffer submitted,
// then อนุมัติ / ให้แก้ไข (+หมายเหตุ). Every review is appended to the run's approval history.
export function StockRunReview({ id, isOwner }: { id: string; isOwner: boolean }) {
  const [run, setRun] = useState<StockRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const found = await fetchRunById(id);
      if (!found) setNotFound(true);
      else setRun(found);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <main className="page">
        <p className="my-shift__loading">กำลังโหลด…</p>
      </main>
    );
  }

  if (notFound || !run) {
    return (
      <main className="page">
        <Link href="/admin/stock-runs" className="back-link">
          ← กลับ ตรวจนับ Stock
        </Link>
        <section className="staff-empty">
          <p>ไม่พบงานตรวจนับนี้ — อาจถูกลบไปแล้ว</p>
        </section>
      </main>
    );
  }

  async function onApprove() {
    if (!run) return;
    setBusy(true);
    setError(null);
    try {
      await approveRun(run.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "อนุมัติไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function onRequestRevision() {
    if (!run) return;
    if (!revisionNote.trim()) {
      setError("ใส่หมายเหตุว่าต้องแก้อะไร");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestRunRevision(run.id, revisionNote.trim());
      setRevisionNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งกลับให้แก้ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!run) return;
    setBusy(true);
    setError(null);
    try {
      await deleteRun(run.id);
      window.location.href = "/admin/stock-runs";
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
      setBusy(false);
    }
  }

  const lines = meaningfulCountLines(run.counts || []);
  const discrepancy = hasDiscrepancy(run.counts || []);

  return (
    <main className="page">
      <Link href="/admin/stock-runs" className="back-link">
        ← กลับ ตรวจนับ Stock
      </Link>

      <section className="board-hero">
        <div>
          <p className="eyebrow">{stockRunKindLabel[run.kind]}</p>
          <h2>
            {displayNameFor(run.staffCode)} · รอบ {run.periodLabel}
          </h2>
          <p>
            เริ่ม {run.startedAt ? run.startedAt.slice(0, 16).replace("T", " ") : "-"}
            {run.submittedAt ? ` · ส่ง ${run.submittedAt.slice(0, 16).replace("T", " ")}` : ""}
            {run.dueDate ? ` · กำหนดส่ง ${run.dueDate}` : ""}
          </p>
        </div>
        <span className={`status-pill ${stockRunStatusClass[run.status]}`}>{stockRunStatusLabel[run.status]}</span>
      </section>

      <section className="assignment-detail__brief soft-card">
        <p className="assign-work__label">รายการนับ ({lines.length})</p>
        {lines.length ? (
          <div className="stock-run-count stock-run-count--review">
            <div className="stock-run-count__head">
              <span>สินค้า</span>
              <span>ระบบ</span>
              <span>นับจริง</span>
              <span>ผลต่าง</span>
            </div>
            {lines.map((line, index) => {
              const diff = lineDiff(line);
              return (
                <div key={index} className="stock-run-count__row stock-run-count__row--review">
                  <span>{line.name}</span>
                  <span>{line.system ?? "–"}</span>
                  <span>{line.counted ?? "–"}</span>
                  <span className={diff !== null && diff !== 0 ? "stock-run-count__diff is-off" : "stock-run-count__diff"}>
                    {diff === null ? "–" : diff > 0 ? `+${diff}` : String(diff)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p>ยังไม่มีรายการนับ</p>
        )}
        {discrepancy ? <p className="phase-warning">มีรายการไม่ตรง — ตรวจหลักฐานก่อนอนุมัติ ห้ามปรับยอดในระบบก่อนอนุมัติ</p> : null}
      </section>

      {run.lowStock || run.refill || run.reorder || run.note ? (
        <section className="assignment-detail__brief soft-card">
          <dl className="assignment-detail__spec">
            {run.lowStock ? (
              <div>
                <dt>ใกล้หมด</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{run.lowStock}</dd>
              </div>
            ) : null}
            {run.refill ? (
              <div>
                <dt>เติมแล้ว</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{run.refill}</dd>
              </div>
            ) : null}
            {run.reorder ? (
              <div>
                <dt>ต้องสั่งเพิ่ม</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{run.reorder}</dd>
              </div>
            ) : null}
            {run.note ? (
              <div>
                <dt>หมายเหตุ</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{run.note}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      <section className="assignment-detail__brief soft-card">
        <p className="assign-work__label">รูปหลักฐาน</p>
        {run.evidence?.length ? (
          <div className="assignment-detail__evidence-view">
            {run.evidence.map((u) =>
              isImageUrl(u) ? (
                <img key={u} className="evidence-input__preview" src={u} alt="หลักฐาน" />
              ) : (
                <a key={u} href={u} target="_blank" rel="noreferrer">
                  {u}
                </a>
              )
            )}
          </div>
        ) : (
          <p>ยังไม่แนบหลักฐาน</p>
        )}
      </section>

      {run.approvals?.length ? (
        <section className="assignment-detail__brief soft-card">
          <p className="assign-work__label">ประวัติการตรวจ ({run.approvals.length})</p>
          <ul className="owner-ops__list">
            {run.approvals.map((entry, index) => (
              <li key={index}>
                <strong>
                  {entry.status === "approved" ? "อนุมัติ" : "ให้แก้ไข"} · {entry.at.slice(0, 16).replace("T", " ")}
                </strong>
                <small>
                  {entry.by}
                  {entry.note ? ` · ${entry.note}` : ""}
                </small>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {error ? <p className="input-status warning">{error}</p> : null}

      {isOwner ? (
        <article className="performance-input-panel">
          <div>
            <p className="eyebrow">Owner review</p>
            <h3>ตรวจงานตรวจนับ</h3>
          </div>
          {run.status === "submitted" ? (
            <div className="performance-input-form">
              <p>งานที่พนักงานส่งมา — อนุมัติ หรือส่งกลับให้แก้</p>
              <button type="button" className="primary-action" onClick={onApprove} disabled={busy}>
                ✓ อนุมัติ
              </button>
              <label className="wide">
                หมายเหตุถ้าให้แก้ไข
                <textarea
                  value={revisionNote}
                  onChange={(e) => setRevisionNote(e.target.value)}
                  placeholder="บอกพนักงานว่าต้องแก้อะไร"
                  rows={3}
                />
              </label>
              <button type="button" className="btn-soft" onClick={onRequestRevision} disabled={busy || !revisionNote.trim()}>
                ส่งกลับให้แก้
              </button>
            </div>
          ) : run.status === "approved" ? (
            <p className="assignment-detail__ok">✓ อนุมัติแล้ว</p>
          ) : run.status === "needs_revision" ? (
            <p>ส่งกลับให้พนักงานแก้แล้ว — รอส่งใหม่</p>
          ) : (
            <p>พนักงานยังไม่ส่งงานตรวจนับ</p>
          )}
          <button type="button" className="staff-form__delete" onClick={onDelete} disabled={busy} style={{ marginTop: "0.75rem" }}>
            ลบงานตรวจนับนี้
          </button>
        </article>
      ) : null}
    </main>
  );
}
