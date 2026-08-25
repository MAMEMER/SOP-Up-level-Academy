"use client";

import { useEffect, useState } from "react";
import { EvidencePhotosInput } from "./EvidencePhotosInput.tsx";
import { displayNameFor } from "../lib/employee-directory.ts";
import { shiftLabel } from "../lib/shift-schedule.ts";
import {
  currentOwnerOf,
  handoverHistory,
  originalOwnerOf,
  validateHandover
} from "../lib/project-handover.ts";
import type { WorkProject } from "../lib/work-projects.ts";
import { fetchHandoverCandidates, forceProjectOwner, handoverProject } from "../lib/work-projects-store.ts";

type Candidate = { staffCode: string; shift: "s1" | "s2" };

/**
 * ส่งต่องานที่ยังไม่เสร็จให้คนกะถัดไป — อยู่ในการ์ดของ "งานที่มอบหมาย" เอง ไม่แยกเป็นอีกหน้า
 * (ใบงาน iDBqn3jE). โชว์ผู้รับผิดชอบตอนนี้, ประวัติการส่งต่อทุกทอด และปุ่มส่งต่อสำหรับคนที่ถืองานอยู่
 * (แอดมินเปลี่ยนตัวคนได้ตลอด แต่ต้องเขียนเหตุผล).
 */
export function ProjectHandoverPanel({
  project,
  branch,
  today,
  staffCode,
  isAdmin,
  staffOptions,
  onDone
}: {
  project: WorkProject;
  branch: string;
  today: string;
  staffCode: string | null;
  isAdmin: boolean;
  /** รายชื่อทีมทั้งสาขา — ใช้ตอนยังไม่ได้วางกะของวันถัดไป */
  staffOptions: Array<{ code: string; displayName: string }>;
  onDone: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateDate, setCandidateDate] = useState<string>("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const owner = currentOwnerOf(project);
  const original = originalOwnerOf(project);
  const history = handoverHistory(project);
  const isOwner = Boolean(staffCode && staffCode === owner);
  const canHandover = project.status === "active" && (isOwner || isAdmin);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetchHandoverCandidates(branch, today)
      .then((result) => {
        if (!alive) return;
        setCandidates(result.candidates.filter((entry) => entry.staffCode !== owner));
        setCandidateDate(result.date);
      })
      .catch(() => alive && setCandidates([]));
    return () => {
      alive = false;
    };
  }, [open, branch, today, owner]);

  async function submit() {
    if (!staffCode && !isAdmin) return;
    const forced = isAdmin && !isOwner;
    const input = { to, date: today, note: note.trim(), forced };
    const invalid = validateHandover(project, input, { staffCode: staffCode || "", isAdmin });
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const attachments = photos.split("\n").map((url) => url.trim()).filter(Boolean);
      if (forced) {
        await forceProjectOwner({ id: project.id, to, date: today, note: note.trim() });
      } else {
        await handoverProject({ id: project.id, to, date: today, note: note.trim(), attachments });
      }
      setTo("");
      setNote("");
      setPhotos("");
      setOpen(false);
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งต่องานไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const options = candidates.length
    ? candidates.map((entry) => ({ code: entry.staffCode, label: `${displayNameFor(entry.staffCode)} · ${shiftLabel(entry.shift)}` }))
    : staffOptions.filter((entry) => entry.code !== owner).map((entry) => ({ code: entry.code, label: entry.displayName }));

  return (
    <div className="project-handover">
      <p className="project-handover__owner">
        ผู้รับผิดชอบตอนนี้: <strong>{displayNameFor(owner)}</strong>
        {original && original !== owner ? <span> · เริ่มจาก {displayNameFor(original)}</span> : null}
      </p>

      {history.length ? (
        <ol className="project-handover__log">
          {history.map((entry) => (
            <li key={entry.id}>
              <span className="project-handover__log-date">{entry.date}</span>
              <span>
                {displayNameFor(entry.from)} → {displayNameFor(entry.to)}
                {entry.status === "forced" ? " (แอดมินเปลี่ยนให้)" : ""}
                {entry.note ? ` · ${entry.note}` : ""}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {canHandover ? (
        open ? (
          <div className="project-handover__form">
            <label>
              ส่งต่อให้
              <select value={to} onChange={(event) => setTo(event.target.value)}>
                <option value="">เลือกคนรับงาน</option>
                {options.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {candidates.length ? (
              <p className="project-handover__hint">คนที่ลงกะไว้วันที่ {candidateDate}</p>
            ) : (
              <p className="project-handover__hint">ยังไม่ได้วางกะของวันถัดไป — เลือกจากทีมทั้งหมดได้</p>
            )}
            <textarea
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={isAdmin && !isOwner ? "เหตุผลที่เปลี่ยนผู้รับผิดชอบ (บันทึกไว้ในประวัติ)" : "ทำถึงไหนแล้ว เหลืออะไรให้คนรับทำต่อ"}
            />
            <EvidencePhotosInput value={photos} onChange={setPhotos} label="แนบรูป/หลักฐานให้คนรับ (ถ้ามี)" />
            {error ? <p className="project-progress-form__error">{error}</p> : null}
            <div className="project-handover__actions">
              <button type="button" className="primary-action" onClick={submit} disabled={busy || !to}>
                {busy ? "กำลังส่งต่อ…" : isAdmin && !isOwner ? "เปลี่ยนผู้รับผิดชอบ" : "ส่งต่องาน"}
              </button>
              <button type="button" className="project-handover__cancel" onClick={() => { setOpen(false); setError(null); }}>
                ยกเลิก
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="project-handover__open" onClick={() => setOpen(true)}>
            {isAdmin && !isOwner ? "เปลี่ยนผู้รับผิดชอบ" : "ส่งต่องานให้คนถัดไป"}
          </button>
        )
      ) : null}
    </div>
  );
}
