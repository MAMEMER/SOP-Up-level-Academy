"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, FolderOpen, Send } from "lucide-react";
import { EvidencePhotosInput } from "./EvidencePhotosInput.tsx";
import { ProjectHandoverPanel } from "./ProjectHandoverPanel.tsx";
import { DueLine, OwnerFeedback, ProgressLine, StateBadge, TaskTimeline, useDraft } from "./TaskInboxParts.tsx";
import { displayNameFor, employeeDirectory } from "../lib/employee-directory.ts";
import { addProjectProgress, fetchProjectsForStaff, submitFinalWork } from "../lib/work-projects-store.ts";
import { MODE_LABEL, hasProgressOn, projectMode, type WorkProject } from "../lib/work-projects.ts";
import { amountLeft, hasDailyUpdates, inboxTasks, taskState, trackModeOf, validateSubmission } from "../lib/task-inbox.ts";

// หน้าแจ้งเตือนงาน (พนักงาน) — แยกจากกระดิ่ง notification.
// งานอยู่ตรงนี้จนกว่าน้องจะกด "ส่งงานสมบูรณ์" พร้อมรูปหลักฐาน แล้วไปรอเจ้าของตรวจในแฟ้มงาน.
// ถ้าเจ้าของสั่งแก้ งานกลับมาอยู่บนสุดพร้อมคอมเมนต์และรูปที่เจ้าของแนบ.
export function TaskInbox({
  branch,
  staffCode,
  today,
  readOnly = false
}: {
  branch: string;
  staffCode: string | null;
  today: string;
  readOnly?: boolean;
}) {
  const [tasks, setTasks] = useState<WorkProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!staffCode) {
      setLoading(false);
      return;
    }
    try {
      setTasks(inboxTasks(await fetchProjectsForStaff(branch, staffCode), staffCode));
      setError(null);
    } catch {
      setError("โหลดงานไม่สำเร็จ — ลองรีเฟรช ถ้ายังไม่ขึ้นแจ้งแอดมิน");
    } finally {
      setLoading(false);
    }
  }, [branch, staffCode]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!staffCode) return <p className="ti-empty">บัญชีนี้ยังไม่ผูกกับรหัสพนักงาน</p>;
  if (loading) return <p className="ti-empty">กำลังโหลด…</p>;
  if (error) return <p className="ti-error">{error}</p>;

  return (
    <div className="ti-inbox">
      {tasks.length === 0 ? (
        <div className="ti-clear">
          <p className="ti-clear__title">ไม่มีงานค้าง</p>
          <p>งานที่ส่งแล้วรอเจ้าของตรวจ ดูได้ในแฟ้มงาน</p>
          <Link href="/my-tasks/file" className="ti-btn ti-btn--soft">
            <FolderOpen size={16} aria-hidden /> เปิดแฟ้มงาน
          </Link>
        </div>
      ) : (
        tasks.map((task) => <InboxCard key={task.id} task={task} branch={branch} staffCode={staffCode} today={today} readOnly={readOnly} onChanged={load} />)
      )}
    </div>
  );
}

function InboxCard({
  task,
  branch,
  staffCode,
  today,
  readOnly,
  onChanged
}: {
  task: WorkProject;
  branch: string;
  staffCode: string;
  today: string;
  readOnly: boolean;
  onChanged: () => Promise<void>;
}) {
  const staffOptions = employeeDirectory
    .filter((entry) => entry.branch === branch)
    .map((entry) => ({ code: entry.code, displayName: entry.displayName }));
  const [historyOpen, setHistoryOpen] = useState(false);
  const fix = taskState(task, staffCode) === "needs_fix";
  const daily = hasDailyUpdates(task);
  const updatedToday = hasProgressOn(task, today, projectMode(task) === "group" ? undefined : staffCode);

  return (
    <div className={fix ? "ti-card is-fix" : "ti-card"}>
      {task.parentTitle ? <p className="ti-card__parent">งานย่อยของ · {task.parentTitle}</p> : null}
      <header className="ti-card__head">
        <h3>{task.title}</h3>
        <StateBadge project={task} assignee={staffCode} today={today} />
      </header>
      <DueLine project={task} assignee={staffCode} today={today} />
      <p className="ti-card__meta">
        {MODE_LABEL[projectMode(task)]}
        {task.assignees.length > 1 ? ` · ${task.assignees.map(displayNameFor).join(", ")}` : ""}
      </p>
      {task.detail ? <p className="ti-card__detail">{task.detail}</p> : null}
      {task.expectedResult ? (
        <p className="ti-card__detail">
          <strong>งานเสร็จคือ</strong> {task.expectedResult}
        </p>
      ) : null}

      {fix ? <OwnerFeedback project={task} assignee={staffCode} /> : null}
      {daily ? <ProgressLine project={task} today={today} /> : null}

      {!readOnly && daily && !fix ? (
        <>
          {!updatedToday && task.startDate <= today ? <p className="ti-nudge">วันนี้ยังไม่ได้ส่งอัปเดต</p> : null}
          <UpdateForm task={task} today={today} onSaved={onChanged} />
        </>
      ) : null}
      {!readOnly ? <SubmitForm task={task} today={today} fix={fix} onSaved={onChanged} /> : null}
      {/* ส่งต่องานให้คนกะถัดไป (ระบบเดิม ใบงาน iDBqn3jE) */}
      {!readOnly ? (
        <ProjectHandoverPanel project={task} branch={branch} today={today} staffCode={staffCode} isAdmin={false} staffOptions={staffOptions} onDone={onChanged} />
      ) : null}

      <button type="button" className="ti-toggle" aria-expanded={historyOpen} onClick={() => setHistoryOpen((v) => !v)}>
        <ChevronDown size={16} aria-hidden className={historyOpen ? "is-open" : undefined} />
        {historyOpen ? "ซ่อนประวัติงาน" : "ดูประวัติงาน"}
      </button>
      {historyOpen ? <TaskTimeline project={task} /> : null}
    </div>
  );
}

/** ส่งอัปเดตรายวัน — บอกว่าทำไปเท่าไร ไม่ต้องคิดเป็น % */
function UpdateForm({ task, today, onSaved }: { task: WorkProject; today: string; onSaved: () => Promise<void> }) {
  const mode = trackModeOf(task);
  const [note, setNote, clearNote] = useDraft(`ti-update-${task.id}`);
  const [amount, setAmount] = useState("");
  const [percent, setPercent] = useState(0);
  const [photos, setPhotos] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const unit = task.unit || "";
  const amountOk = mode !== "amount" || (amount.trim() !== "" && Number(amount) >= 0);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await addProjectProgress({
        id: task.id,
        date: today,
        percent: mode === "percent" ? percent : 0,
        note: note.trim(),
        images: photos.split("\n").map((url) => url.trim()).filter(Boolean),
        ...(mode === "amount" ? { amount: Number(amount) } : {})
      });
      clearNote();
      setAmount("");
      setPhotos("");
      setSaved(true);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ti-form">
      <p className="ti-form__label">ส่งอัปเดตวันนี้</p>
      {mode === "amount" ? (
        <label className="ti-field">
          วันนี้ทำเพิ่มไปกี่ {unit || "ชิ้น"}
          <input type="number" inputMode="numeric" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`เหลืออีก ${amountLeft(task).toLocaleString("th-TH")} ${unit}`} />
        </label>
      ) : null}
      {mode === "percent" ? (
        <label className="ti-field">
          ตอนนี้เสร็จไปแล้ว {percent}%
          <input type="range" min={0} max={100} step={5} value={percent} onChange={(e) => setPercent(Number(e.target.value))} />
        </label>
      ) : null}
      <label className="ti-field">
        วันนี้ทำอะไรไปบ้าง
        <textarea rows={2} value={note} onChange={(e) => { setNote(e.target.value); setSaved(false); }} placeholder="เช่น นับการ์ดกล่อง A เสร็จ 2 แฟ้ม เหลือกล่อง B" />
      </label>
      <EvidencePhotosInput value={photos} onChange={setPhotos} label="แนบรูป (ถ้ามี)" />
      {error ? <p className="ti-error">{error}</p> : null}
      <button type="button" className="ti-btn ti-btn--soft" onClick={submit} disabled={busy || !note.trim() || !amountOk}>
        {busy ? "กำลังส่ง…" : saved ? "ส่งแล้ว · ส่งเพิ่มได้" : "ส่งอัปเดต"}
      </button>
    </div>
  );
}

/** ส่งงานสมบูรณ์ — ต้องมีรูปหลักฐานก่อน ปุ่มถึงจะกดได้ */
function SubmitForm({ task, today, fix, onSaved }: { task: WorkProject; today: string; fix: boolean; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(!hasDailyUpdates(task) || fix);
  const [note, setNote, clearNote] = useDraft(`ti-submit-${task.id}`);
  const [photos, setPhotos, clearPhotos] = useDraft(`ti-submit-photos-${task.id}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const images = photos.split("\n").map((url) => url.trim()).filter(Boolean);
  const blocked = validateSubmission({ note, images });

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await submitFinalWork({ id: task.id, date: today, note: note.trim(), images });
      clearNote();
      clearPhotos();
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="ti-btn ti-btn--primary" onClick={() => setOpen(true)}>
        <Send size={16} aria-hidden /> งานเสร็จแล้ว · ส่งงาน
      </button>
    );
  }

  return (
    <div className="ti-form ti-form--submit">
      <p className="ti-form__label">{fix ? "ส่งงานที่แก้แล้ว" : "ส่งงานสมบูรณ์"}</p>
      <p className="ti-form__hint">ส่งแล้วงานจะหายจากหน้านี้ ไปรอเจ้าของตรวจในแฟ้มงาน</p>
      <EvidencePhotosInput value={photos} onChange={setPhotos} label="รูปหลักฐาน (ต้องมีอย่างน้อย 1 รูป)" />
      <label className="ti-field">
        สรุปงาน
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ติดลูกโป่งหน้าร้านครบ 20 ลูก" />
      </label>
      {error ? <p className="ti-error">{error}</p> : null}
      <button type="button" className="ti-btn ti-btn--primary" onClick={submit} disabled={busy || Boolean(blocked)}>
        <Send size={16} aria-hidden />
        {busy ? "กำลังส่ง…" : blocked ? (images.length ? "เขียนสรุปงานก่อนส่ง" : "แนบรูปหลักฐานก่อนส่ง") : "ส่งงานสมบูรณ์"}
      </button>
    </div>
  );
}
