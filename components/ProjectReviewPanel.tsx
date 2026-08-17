"use client";

import { useState } from "react";
import {
  ASSIGNEE_STATUS_CLASS,
  ASSIGNEE_STATUS_LABEL,
  OUTCOME_LABEL,
  assigneeReviewSummary,
  computeReviewPoints
} from "../lib/project-review.ts";
import { displayNameFor } from "../lib/employee-directory.ts";
import { deleteProjectReview, reviewApproveWork, reviewRequestFix } from "../lib/work-projects-store.ts";
import { sortProgressNewestFirst, type WorkProject } from "../lib/work-projects.ts";

// ตรวจงานที่มอบหมาย + คิดคะแนน KPI รายคน. แต่ละคนที่มีชื่อในงานได้ผลคะแนนแยกกัน:
//   ยืนยันผ่าน → เร็ว +1 / ตรงเวลา 0 / แก้ทัน +1 คืน / ช้า −3 ต่อวัน
//   ให้แก้ไข   → −1 ทันที + ตั้งกำหนดส่งใหม่
// คะแนนถูกบันทึกก็ต่อเมื่อกดยืนยันผลตรวจเท่านั้น แล้วไหลเข้าหน้าคะแนนพนักงานอัตโนมัติ.
export function ProjectReviewPanel({
  project,
  today,
  onChanged
}: {
  project: WorkProject;
  today: string;
  onChanged: () => Promise<void>;
}) {
  return (
    <div className="project-review">
      <p className="project-review__label">ตรวจงาน & คะแนน (รายคน)</p>
      <div className="project-review__people">
        {project.assignees.map((code) => (
          <AssigneeReviewRow key={code} project={project} assignee={code} today={today} onChanged={onChanged} />
        ))}
      </div>
      <ReviewLedger project={project} onChanged={onChanged} />
    </div>
  );
}

function defaultSubmittedDate(project: WorkProject, assignee: string, today: string): string {
  const isGroup = (project.mode ?? (project.assignees.length > 1 ? "group" : "single")) === "group";
  const last = sortProgressNewestFirst(project.progress || []).find((entry) => isGroup || entry.by === assignee);
  return last?.date || today;
}

function AssigneeReviewRow({
  project,
  assignee,
  today,
  onChanged
}: {
  project: WorkProject;
  assignee: string;
  today: string;
  onChanged: () => Promise<void>;
}) {
  const summary = assigneeReviewSummary(project, assignee);
  const [submittedDate, setSubmittedDate] = useState(() => defaultSubmittedDate(project, assignee, today));
  const [revisedDue, setRevisedDue] = useState(summary.due);
  const [note, setNote] = useState("");
  const [showFix, setShowFix] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // พรีวิวผลถ้ากด "ยืนยันผ่าน" ตอนนี้ — ให้เจ้าของเห็นคะแนนก่อนกด
  const preview = computeReviewPoints({
    verdict: "approve",
    dueDate: summary.due,
    submittedDate,
    hadRevision: summary.openRevision
  });

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setNote("");
      setShowFix(false);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="preview-row">
      <div className="preview-row__top">
        <strong>{summary.displayName}</strong>
        <span className={`preview-row__badge ${ASSIGNEE_STATUS_CLASS[summary.status]}`}>{ASSIGNEE_STATUS_LABEL[summary.status]}</span>
        <span className={summary.netPoints < 0 ? "preview-row__pts is-neg" : "preview-row__pts"}>
          {summary.netPoints > 0 ? "+" : ""}
          {summary.netPoints} คะแนน
        </span>
      </div>
      <p className="preview-row__due">
        กำหนดส่งที่มีผล: {summary.due}
        {summary.openRevision ? " · รอส่งแก้ไข" : ""}
      </p>

      <div className="preview-row__form">
        <label>
          วันที่ส่งจริง
          <input type="date" value={submittedDate} onChange={(e) => setSubmittedDate(e.target.value)} disabled={busy} />
        </label>
        <span className={preview.points < 0 ? "preview-row__hint is-neg" : "preview-row__hint"}>
          ถ้ากดผ่าน → {OUTCOME_LABEL[preview.outcome]} ({preview.points >= 0 ? "+" : ""}
          {preview.points})
        </span>
      </div>

      {showFix ? (
        <div className="preview-row__form">
          <label>
            กำหนดส่งแก้ไขใหม่
            <input type="date" value={revisedDue} onChange={(e) => setRevisedDue(e.target.value)} disabled={busy} />
          </label>
          <span className="preview-row__hint is-neg">หัก −1 ทันที · แก้ทันกำหนดใหม่ได้ +1 คืน</span>
        </div>
      ) : null}

      <label className="preview-row__note">
        หมายเหตุ (ถ้ามี)
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} placeholder="เช่น เหตุผลที่ให้แก้" />
      </label>

      <div className="preview-row__actions">
        <button
          type="button"
          className="mrev-btn mrev-btn--approve"
          disabled={busy}
          onClick={() => run(() => reviewApproveWork({ id: project.id, assignee, submittedDate, note: note.trim() || undefined }))}
        >
          ยืนยันผ่าน
        </button>
        {showFix ? (
          <button
            type="button"
            className="mrev-btn mrev-btn--fix"
            disabled={busy}
            onClick={() => run(() => reviewRequestFix({ id: project.id, assignee, revisedDue, note: note.trim() || undefined }))}
          >
            บันทึกให้แก้ไข (−1)
          </button>
        ) : (
          <button type="button" className="assign-work__revise" disabled={busy} onClick={() => setShowFix(true)}>
            ให้แก้ไข
          </button>
        )}
      </div>
      {error ? <p className="mrev-error">{error}</p> : null}
    </section>
  );
}

function ReviewLedger({ project, onChanged }: { project: WorkProject; onChanged: () => Promise<void> }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const entries = [...(project.reviews || [])].sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt));
  if (entries.length === 0) return <p className="project-review__empty">ยังไม่มีประวัติการตรวจ</p>;

  async function remove(reviewId: string) {
    setBusyId(reviewId);
    try {
      await deleteProjectReview(project.id, reviewId);
      await onChanged();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="review-ledger">
      <p className="project-review__label">ประวัติคะแนน (ย้อนตรวจได้)</p>
      {entries.map((entry) => (
        <div key={entry.id} className="review-ledger__row">
          <div>
            <strong>{displayNameFor(entry.assignee)}</strong> · {OUTCOME_LABEL[entry.outcome]}
            <span className={entry.points < 0 ? "review-ledger__pts is-neg" : "review-ledger__pts"}>
              {entry.points >= 0 ? "+" : ""}
              {entry.points}
            </span>
          </div>
          <small>
            กำหนด {entry.dueDate}
            {entry.revisedDue ? ` → แก้ไข ${entry.revisedDue}` : ""}
            {entry.submittedDate ? ` · ส่งจริง ${entry.submittedDate}` : ""}
            {entry.daysLate > 0 ? ` · ช้า ${entry.daysLate} วัน` : ""}
            {entry.note ? ` · ${entry.note}` : ""}
          </small>
          <small className="review-ledger__by">
            โดย {entry.confirmedByName || entry.confirmedBy} · {entry.confirmedAt.slice(0, 16).replace("T", " ")}
          </small>
          <button type="button" className="review-ledger__del" disabled={busyId === entry.id} onClick={() => remove(entry.id)}>
            ลบ
          </button>
        </div>
      ))}
    </div>
  );
}
