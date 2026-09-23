"use client";

import { useEffect, useState } from "react";
import { displayNameFor } from "../lib/employee-directory.ts";
import { fetchStoreTasks, type TaskRecord } from "../lib/store-tasks-store.ts";
import {
  carryOverSpecs,
  percentOf,
  periodKeyForSchedule,
  progressKey,
  statusLabel,
  summarizeProgress,
  type TaskProgressEntry
} from "../lib/task-progress.ts";
import { specsDueFor, type WorkSpec } from "../lib/work-spec.ts";

// ฝั่งหัวหน้า: วันนี้งานไหนถึงไหนแล้ว — ใครเริ่ม ใครอัพเดทล่าสุด ติดอะไรอยู่.
// อ่านอย่างเดียว ไม่แก้สถานะแทนพนักงาน เพื่อให้ประวัติเป็นของคนทำงานจริง.
export function TaskProgressBoard({ branch, date }: { branch: string; date: string }) {
  const [tasks, setTasks] = useState<WorkSpec[]>([]);
  const [records, setRecords] = useState<Record<string, TaskRecord>>({});
  const [progress, setProgress] = useState<Record<string, TaskProgressEntry>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchStoreTasks(branch, date)
      .then((data) => {
        if (!alive) return;
        setTasks(data.tasks);
        setRecords(data.records);
        setProgress(data.progress);
      })
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [branch, date]);

  const due = specsDueFor(tasks, { date, shift: null, staffCode: null });
  const carried = carryOverSpecs(tasks, {
    date,
    dueIds: due.map((task) => task.id),
    doneIds: Object.keys(records),
    progress
  });
  const rows = [...due.map((task) => ({ task, carried: false })), ...carried.map((task) => ({ task, carried: true }))];
  const summary = summarizeProgress(
    rows.map(({ task }) => ({
      done: Boolean(records[task.id]),
      entry: progress[progressKey(task.id, periodKeyForSchedule(task.schedule, date))]
    }))
  );

  if (loading) return <p className="assign-work__empty">กำลังโหลดความคืบหน้า…</p>;
  if (rows.length === 0) return <p className="assign-work__empty">วันนี้ไม่มีงานประจำที่ครบกำหนด</p>;

  return (
    <div className="today-tasks">
      <p className="shared-checklist__meta">
        {date} · เสร็จ {summary.done}/{summary.total} · รวม {summary.percent}%
        {summary.active ? ` · กำลังทำ ${summary.active}` : ""}
        {summary.stuck ? ` · ติดปัญหา ${summary.stuck}` : ""}
        {summary.notStarted ? ` · ยังไม่เริ่ม ${summary.notStarted}` : ""}
      </p>
      <span className="today-tasks__bar" role="img" aria-label={`งานวันนี้คืบหน้า ${summary.percent}%`}>
        <span className="today-tasks__bar-fill" style={{ width: `${summary.percent}%` }} />
      </span>
      <ul className="shared-checklist__list">
        {rows.map(({ task, carried: isCarried }) => {
          const record = records[task.id];
          const entry = progress[progressKey(task.id, periodKeyForSchedule(task.schedule, date))];
          const done = Boolean(record) || entry?.status === "done";
          const percent = percentOf(entry, Boolean(record));
          const last = entry?.updates.at(-1);
          return (
            <li key={task.id} className={done ? "shared-checklist__item shared-checklist__item--done" : "shared-checklist__item"}>
              <span className="shared-checklist__mark" aria-hidden="true">
                {done ? "●" : entry ? `${percent}%` : "○"}
              </span>
              <span>
                <strong>{task.title}</strong>
                <em className="shared-checklist__item-meta">
                  {statusLabel(entry, Boolean(record))}
                  {isCarried && entry ? ` · ค้างจาก ${entry.startedAt.slice(0, 10)}` : ""}
                </em>
                {entry ? (
                  <small>
                    {displayNameFor(entry.startedBy)} เริ่ม
                    {entry.startedBy === entry.updatedBy ? "" : ` · ${displayNameFor(entry.updatedBy)} อัพเดทล่าสุด`}
                    {` · ${entry.updatedAt.slice(11, 16)} น.`}
                  </small>
                ) : record ? (
                  <small>
                    ส่งโดย {displayNameFor(record.by)} · {record.at.slice(11, 16)} น.
                  </small>
                ) : null}
                {entry?.blockedNote ? <em className="task-progress__blocked">ติดอยู่ที่: {entry.blockedNote}</em> : null}
                {last?.note && !entry?.blockedNote ? <em>{last.note}</em> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
