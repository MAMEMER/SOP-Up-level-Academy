"use client";

import { useCallback, useEffect, useState } from "react";
import { ChecklistItemGuide } from "./ChecklistItemGuide.tsx";
import { EvidencePhotosInput } from "./EvidencePhotosInput.tsx";
import { answerNeedsInput } from "../lib/checklist-overrides.ts";
import { displayNameFor } from "../lib/employee-directory.ts";
import { fetchStoreTasks, submitStoreTask, type TaskRecord } from "../lib/store-tasks-store.ts";
import { groupByCategory, scheduleLabel, specsDueFor, timingLabel, timingStateAt, type WorkSpec } from "../lib/work-spec.ts";
import type { ShiftCode } from "../lib/shift-schedule.ts";

// งานของพนักงานในวันนี้ — รายวัน / รายสัปดาห์ / รายเดือน ปนกันในลิสต์เดียว เพราะคนทำงานไม่ได้
// คิดเป็น "ความถี่" คิดแค่ว่า "วันนี้ต้องทำอะไรบ้าง". หมวดหมู่ใช้จัดกลุ่มให้อ่านง่ายเท่านั้น.
export function TodayTaskList({
  branch,
  date,
  shift,
  staffCode,
  readOnly = false
}: {
  branch: string;
  date: string;
  shift: ShiftCode | null;
  staffCode: string | null;
  readOnly?: boolean;
}) {
  const [tasks, setTasks] = useState<WorkSpec[]>([]);
  const [records, setRecords] = useState<Record<string, TaskRecord>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchStoreTasks(branch, date);
      setTasks(data.tasks);
      setRecords(data.records);
      setError(null);
    } catch {
      setError("โหลดงานวันนี้ไม่สำเร็จ — ลองรีเฟรช");
    } finally {
      setLoading(false);
    }
  }, [branch, date]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(task: WorkSpec, answer?: { value?: string; photos?: string[] }) {
    if (readOnly) return;
    setBusyId(task.id);
    try {
      const done = await submitStoreTask({
        branch,
        date,
        taskId: task.id,
        done: !records[task.id],
        value: answer?.value,
        photos: answer?.photos
      });
      setRecords(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งงานไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  const due = specsDueFor(tasks, { date, shift, staffCode });
  const groups = groupByCategory(due);
  const doneCount = due.filter((task) => records[task.id]).length;

  if (loading) return <p className="assign-work__empty">กำลังโหลด…</p>;
  if (error) return <p className="project-progress-form__error">{error}</p>;
  if (due.length === 0) return <p className="assign-work__empty">วันนี้ไม่มีงานประจำที่ต้องทำ</p>;

  return (
    <div className="today-tasks">
      <p className="shared-checklist__meta">
        วันนี้ {date} · เสร็จ {doneCount}/{due.length}
        {shift ? ` · กะ ${shift === "s1" ? "1" : "2"}` : ""}
      </p>
      {groups.map((group) => (
        <section key={group.category} className="today-tasks__group">
          <p className="task-group__title">{group.category}</p>
          <ul className="shared-checklist__list">
            {group.specs.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                record={records[task.id]}
                disabled={readOnly || busyId === task.id}
                onSubmit={(answer) => submit(task, answer)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function nowHhMm(): string {
  return new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
}

function TaskRow({
  task,
  record,
  disabled,
  onSubmit
}: {
  task: WorkSpec;
  record: TaskRecord | undefined;
  disabled: boolean;
  onSubmit: (answer?: { value?: string; photos?: string[] }) => void;
}) {
  const [value, setValue] = useState("");
  const [photos, setPhotos] = useState("");
  const needsInput = answerNeedsInput(task.answer);
  const photoUrls = photos.split("\n").map((url) => url.trim()).filter(Boolean);
  const filled = task.answer?.kind === "photo" ? photoUrls.length > 0 : value.trim().length > 0;
  const timing = timingStateAt(task.timing, nowHhMm());
  // ยังไม่ถึงเวลาเริ่ม = กดไม่ได้ (เจ้าของตั้งไว้ว่าเริ่มได้เมื่อไร) · เลยกำหนดยังส่งได้ แต่ติดป้ายว่าช้า
  const blocked = (needsInput && !record && !filled) || (timing === "before_open" && !record);

  function press() {
    if (record) {
      onSubmit();
      return;
    }
    if (!needsInput) {
      onSubmit();
      return;
    }
    onSubmit(task.answer?.kind === "photo" ? { photos: photoUrls } : { value: value.trim() });
    setValue("");
    setPhotos("");
  }

  return (
    <li className={record ? "shared-checklist__item shared-checklist__item--done" : "shared-checklist__item"}>
      <button type="button" onClick={press} aria-pressed={!!record} disabled={disabled || blocked}>
        {record ? "●" : "○"}
      </button>
      <span>
        <strong>{task.title}</strong>
        <em className="shared-checklist__item-meta">
          {scheduleLabel(task.schedule)} · {timingLabel(task.timing)}
          {task.owners.shifts?.length ? ` · ${task.owners.shifts.map((s) => (s === "s1" ? "กะ 1" : "กะ 2")).join(" ")}` : ""}
          {timing === "late" && !record ? " · เลยเวลาแล้ว" : ""}
          {timing === "before_open" && !record ? " · ยังไม่ถึงเวลาเริ่ม" : ""}
        </em>
        <ChecklistItemGuide note={task.detail} links={task.links} />
        {task.expectedResult ? <em className="today-tasks__result">เสร็จคือ: {task.expectedResult}</em> : null}

        {needsInput && !record ? (
          <span className="shared-checklist__answer">
            {task.answer?.kind === "photo" ? (
              <EvidencePhotosInput value={photos} onChange={setPhotos} disabled={disabled} label={task.answer.placeholder || "แนบรูป"} />
            ) : task.answer?.kind === "choice" ? (
              <select value={value} onChange={(e) => setValue(e.target.value)} disabled={disabled} aria-label="เลือกคำตอบ">
                <option value="">{task.answer.placeholder || "เลือก…"}</option>
                {(task.answer.options || []).map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            ) : (
              <input
                type={task.answer?.kind === "number" ? "number" : "text"}
                inputMode={task.answer?.kind === "number" ? "numeric" : task.answer?.kind === "link" ? "url" : undefined}
                value={value}
                disabled={disabled}
                onChange={(e) => setValue(e.target.value)}
                placeholder={task.answer?.placeholder || "กรอกก่อนส่ง"}
                aria-label="คำตอบ"
              />
            )}
            {blocked ? (
              <small className="shared-checklist__answer-hint">
                {timing === "before_open" ? `เริ่มส่งได้ตั้งแต่ ${task.timing.openTime}` : "กรอกก่อนถึงจะส่งได้"}
              </small>
            ) : null}
          </span>
        ) : null}

        {record?.value ? <small className="shared-checklist__answer-done">{record.value}</small> : null}
        {record?.photos?.length ? (
          <small className="project-days__photos">
            {record.photos.map((url, index) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                <img src={url} alt={`หลักฐาน ${index + 1}`} loading="lazy" />
              </a>
            ))}
          </small>
        ) : null}
        {record ? <small>ส่งโดย {displayNameFor(record.by)} · {record.at.slice(11, 16)} น.</small> : null}
      </span>
    </li>
  );
}
