"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChecklistItemGuide } from "./ChecklistItemGuide.tsx";
import { TaskProgressPanel, type ProgressPayload } from "./TaskProgressPanel.tsx";
import { displayNameFor } from "../lib/employee-directory.ts";
import { fetchStoreTasks, updateTaskProgress, type TaskRecord } from "../lib/store-tasks-store.ts";
import {
  carryOverSpecs,
  percentOf,
  periodKeyForSchedule,
  progressKey,
  summarizeProgress,
  type TaskProgressAction,
  type TaskProgressEntry
} from "../lib/task-progress.ts";
import { groupByCategory, scheduleLabel, specsDueFor, timingLabel, timingStateAt, type WorkSpec } from "../lib/work-spec.ts";
import type { ShiftCode } from "../lib/shift-schedule.ts";

// งานของพนักงานในวันนี้ — รายวัน / รายสัปดาห์ / รายเดือน ปนกันในลิสต์เดียว เพราะคนทำงานไม่ได้
// คิดเป็น "ความถี่" คิดแค่ว่า "วันนี้ต้องทำอะไรบ้าง". หมวดหมู่ใช้จัดกลุ่มให้อ่านง่ายเท่านั้น.
//
// ทุกงานลงได้ละเอียดกว่าติ๊กว่าทำแล้ว: กดเริ่มทำ → อัพเดทเป็น % พร้อมโน้ต/รูป → ติดปัญหา →
// เสร็จ (ดู TaskProgressPanel). งานที่เริ่มค้างไว้แล้วยังไม่เสร็จจะถูกดันขึ้นมาให้เห็นทุกวัน
// จนกว่าจะปิด แม้วันนั้นจะไม่ใช่วันที่ครบกำหนด.
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
  const [progress, setProgress] = useState<Record<string, TaskProgressEntry>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchStoreTasks(branch, date);
      setTasks(data.tasks);
      setRecords(data.records);
      setProgress(data.progress);
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

  const entryKey = useCallback(
    (task: WorkSpec) => progressKey(task.id, periodKeyForSchedule(task.schedule, date)),
    [date]
  );

  async function act(task: WorkSpec, action: TaskProgressAction, payload?: ProgressPayload) {
    if (readOnly) return;
    setBusyId(task.id);
    try {
      const result = await updateTaskProgress({ branch, date, taskId: task.id, action, ...payload });
      setRecords(result.done);
      setProgress(result.progress);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  const due = useMemo(() => specsDueFor(tasks, { date, shift, staffCode }), [tasks, date, shift, staffCode]);
  const carried = useMemo(
    () =>
      carryOverSpecs(tasks, {
        date,
        dueIds: due.map((task) => task.id),
        doneIds: Object.keys(records),
        progress
      }),
    [tasks, date, due, records, progress]
  );
  const groups = groupByCategory(due);
  const summary = summarizeProgress(
    [...due, ...carried].map((task) => ({ done: Boolean(records[task.id]), entry: progress[entryKey(task)] }))
  );

  if (loading) return <p className="assign-work__empty">กำลังโหลด…</p>;
  if (error && tasks.length === 0) return <p className="project-progress-form__error">{error}</p>;
  if (due.length === 0 && carried.length === 0) return <p className="assign-work__empty">วันนี้ไม่มีงานประจำที่ต้องทำ</p>;

  function row(task: WorkSpec, carriedOver = false) {
    const record = records[task.id];
    return (
      <TaskRow
        key={task.id}
        task={task}
        record={record}
        entry={progress[entryKey(task)]}
        carriedOver={carriedOver}
        readOnly={readOnly}
        busy={busyId === task.id}
        onAction={(action, payload) => void act(task, action, payload)}
      />
    );
  }

  return (
    <div className="today-tasks">
      <p className="shared-checklist__meta">
        วันนี้ {date} · เสร็จ {summary.done}/{summary.total} · รวม {summary.percent}%
        {summary.active ? ` · กำลังทำ ${summary.active}` : ""}
        {summary.stuck ? ` · ติดปัญหา ${summary.stuck}` : ""}
        {shift ? ` · กะ ${shift === "s1" ? "1" : "2"}` : ""}
      </p>
      <span className="today-tasks__bar" role="img" aria-label={`งานวันนี้คืบหน้า ${summary.percent}%`}>
        <span className="today-tasks__bar-fill" style={{ width: `${summary.percent}%` }} />
      </span>
      {error ? <p className="project-progress-form__error">{error}</p> : null}

      {carried.length > 0 ? (
        <section className="today-tasks__group today-tasks__group--carried">
          <p className="task-group__title">ค้างอยู่ ต้องทำต่อ</p>
          <ul className="shared-checklist__list">{carried.map((task) => row(task, true))}</ul>
        </section>
      ) : null}

      {groups.map((group) => (
        <section key={group.category} className="today-tasks__group">
          <p className="task-group__title">{group.category}</p>
          <ul className="shared-checklist__list">{group.specs.map((task) => row(task))}</ul>
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
  entry,
  carriedOver,
  readOnly,
  busy,
  onAction
}: {
  task: WorkSpec;
  record: TaskRecord | undefined;
  entry: TaskProgressEntry | undefined;
  carriedOver: boolean;
  readOnly: boolean;
  busy: boolean;
  onAction: (action: TaskProgressAction, payload?: ProgressPayload) => void;
}) {
  const done = Boolean(record) || entry?.status === "done";
  const timing = timingStateAt(task.timing, nowHhMm());
  // ยังไม่ถึงเวลาเริ่ม = ยังลงงานไม่ได้ (เจ้าของตั้งไว้ว่าเริ่มได้เมื่อไร) · เลยกำหนดยังลงได้ แต่ติดป้ายว่าช้า
  const tooEarly = timing === "before_open" && !entry && !done;
  const percent = percentOf(entry, done);

  return (
    <li className={done ? "shared-checklist__item shared-checklist__item--done" : "shared-checklist__item"}>
      <span className="shared-checklist__mark" aria-hidden="true">
        {done ? "●" : entry ? `${percent}%` : "○"}
      </span>
      <span>
        <strong>{task.title}</strong>
        <em className="shared-checklist__item-meta">
          {scheduleLabel(task.schedule)} · {timingLabel(task.timing)}
          {task.owners.shifts?.length ? ` · ${task.owners.shifts.map((s) => (s === "s1" ? "กะ 1" : "กะ 2")).join(" ")}` : ""}
          {carriedOver && entry ? ` · ค้างจาก ${entry.startedAt.slice(0, 10)}` : ""}
          {timing === "late" && !done ? " · เลยเวลาแล้ว" : ""}
          {tooEarly ? ` · เริ่มได้ตั้งแต่ ${task.timing.openTime}` : ""}
        </em>
        <ChecklistItemGuide note={task.detail} links={task.links} />
        {task.expectedResult ? <em className="today-tasks__result">เสร็จคือ: {task.expectedResult}</em> : null}

        <TaskProgressPanel
          entry={entry}
          done={Boolean(record)}
          doneBy={record?.by}
          doneAt={record?.at}
          doneValue={record?.value}
          donePhotos={record?.photos}
          answer={task.answer}
          disabled={readOnly || tooEarly}
          busy={busy}
          onAction={onAction}
        />
        {tooEarly ? <small className="shared-checklist__answer-hint">ยังไม่ถึงเวลาเริ่มงานนี้</small> : null}
        {readOnly && record ? <small>ส่งโดย {displayNameFor(record.by)}</small> : null}
      </span>
    </li>
  );
}
