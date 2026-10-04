"use client";

import { useState } from "react";
import { CheckCircle2, Minus, Plus, RotateCcw } from "lucide-react";
import { EvidencePhotosInput } from "./EvidencePhotosInput.tsx";
import { thaiDate, useDraft } from "./TaskInboxParts.tsx";
import { computeReviewPoints, effectiveDue, hasOpenRevision, reviewEntriesFor, OUTCOME_LABEL } from "../lib/project-review.ts";
import { lastSubmissionFor } from "../lib/task-inbox.ts";
import { reviewApproveWork, reviewRequestFix } from "../lib/work-projects-store.ts";
import { addDays, type WorkProject } from "../lib/work-projects.ts";
import { displayNameFor } from "../lib/employee-directory.ts";

// หน้าตรวจงานของเจ้าของ (รอบท้าย): เลือกผ่าน / ให้แก้ไข · คอมเมนต์ · แนบรูปให้น้องดูว่าตรงไหน
// ยังไม่เรียบร้อย · คะแนน +/− (ระบบแนะนำให้ก่อน เจ้าของปรับเองได้) — คะแนนไหลเข้า KPI หมวด
// "งานที่มอบหมาย" ทางเดียวกับผลตรวจเดิม (lib/project-review.ts projectReviewsToAdjustments)
export function TaskReviewForm({
  task,
  assignee,
  today,
  onSaved
}: {
  task: WorkProject;
  assignee: string;
  today: string;
  onSaved: () => Promise<void>;
}) {
  const due = effectiveDue(task, assignee);
  const submittedDate = lastSubmissionFor(task, assignee)?.date || today;
  const hadRevision = hasOpenRevision(reviewEntriesFor(task, assignee));
  const suggestPass = computeReviewPoints({ verdict: "approve", dueDate: due, submittedDate, hadRevision });
  const suggestFix = computeReviewPoints({ verdict: "request_fix", dueDate: due, hadRevision });

  const [verdict, setVerdict] = useState<"approve" | "request_fix">("approve");
  const [points, setPoints] = useState(suggestPass.points);
  const [note, setNote, clearNote] = useDraft(`ti-review-${task.id}-${assignee}`);
  const [photos, setPhotos] = useState("");
  const [revisedDue, setRevisedDue] = useState(addDays(today, 1));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(next: "approve" | "request_fix") {
    setVerdict(next);
    setPoints(next === "approve" ? suggestPass.points : suggestFix.points);
  }

  const suggested = verdict === "approve" ? suggestPass.points : suggestFix.points;
  const images = photos.split("\n").map((url) => url.trim()).filter(Boolean);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const common = { id: task.id, assignee, note: note.trim() || undefined, images, ...(points !== suggested ? { points } : {}) };
      if (verdict === "approve") await reviewApproveWork({ ...common, submittedDate });
      else await reviewRequestFix({ ...common, revisedDue });
      clearNote();
      setPhotos("");
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ti-review">
      <p className="ti-form__label">ตรวจงานของ {displayNameFor(assignee)}</p>
      <div className="ti-seg" role="radiogroup" aria-label="ผลตรวจ">
        <button type="button" role="radio" aria-checked={verdict === "approve"} className={verdict === "approve" ? "is-on is-green" : undefined} onClick={() => pick("approve")}>
          <CheckCircle2 size={16} aria-hidden /> ผ่าน
        </button>
        <button type="button" role="radio" aria-checked={verdict === "request_fix"} className={verdict === "request_fix" ? "is-on is-red" : undefined} onClick={() => pick("request_fix")}>
          <RotateCcw size={16} aria-hidden /> ให้แก้ไข
        </button>
      </div>

      <label className="ti-field">
        คอมเมนต์ถึงน้อง
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={verdict === "approve" ? "เช่น เรียบร้อยดี ขอบคุณมาก" : "เช่น ลูกโป่งฝั่งซ้ายยังไม่ครบ ป้ายราคายังไม่ติด"}
        />
      </label>
      <EvidencePhotosInput value={photos} onChange={setPhotos} label="แนบรูปให้น้องดู (ถ้ามี)" />

      {verdict === "request_fix" ? (
        <label className="ti-field">
          ส่งแก้ภายในวันที่
          <input type="date" value={revisedDue} min={today} onChange={(e) => setRevisedDue(e.target.value)} />
        </label>
      ) : null}

      <div className="ti-points">
        <span>คะแนน</span>
        <button type="button" aria-label="ลดคะแนน" onClick={() => setPoints((p) => p - 1)}>
          <Minus size={16} aria-hidden />
        </button>
        <strong className={points < 0 ? "is-neg" : points > 0 ? "is-pos" : undefined}>
          {points > 0 ? "+" : ""}
          {points}
        </strong>
        <button type="button" aria-label="เพิ่มคะแนน" onClick={() => setPoints((p) => p + 1)}>
          <Plus size={16} aria-hidden />
        </button>
        <small>
          ระบบแนะนำ {suggested > 0 ? "+" : ""}
          {suggested}
          {verdict === "approve" ? ` (${OUTCOME_LABEL[suggestPass.outcome]} · ส่ง ${thaiDate(submittedDate)} · กำหนด ${thaiDate(due)})` : " (ต้องแก้ไข)"}
          {points !== suggested ? (
            <button type="button" className="ti-link" onClick={() => setPoints(suggested)}>
              ใช้ค่าที่แนะนำ
            </button>
          ) : null}
        </small>
      </div>

      {error ? <p className="ti-error">{error}</p> : null}
      <button type="button" className={verdict === "approve" ? "ti-btn ti-btn--green" : "ti-btn ti-btn--red"} onClick={save} disabled={busy}>
        {busy ? "กำลังบันทึก…" : verdict === "approve" ? `ให้ผ่าน (${points > 0 ? "+" : ""}${points})` : `ส่งกลับให้แก้ (${points > 0 ? "+" : ""}${points})`}
      </button>
    </div>
  );
}
