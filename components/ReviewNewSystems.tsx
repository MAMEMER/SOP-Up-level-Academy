"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Thumbs, thaiDate, thaiDateTime } from "./TaskInboxParts.tsx";
import { displayNameFor } from "../lib/employee-directory.ts";
import { fetchStoreTaskRange, type TaskRecord } from "../lib/store-tasks-store.ts";
import { fetchProjectsForBranch } from "../lib/work-projects-store.ts";
import { lastSubmissionFor, taskState } from "../lib/task-inbox.ts";
import { addDays, type WorkProject } from "../lib/work-projects.ts";
import type { WorkFrequency, WorkSpec } from "../lib/work-spec.ts";

// หน้าตรวจงานที่ส่งมา (/manager-review) เดิมอ่านแค่ระบบเช็คลิสต์เก่า — งานประจำรายสัปดาห์/
// รายเดือนที่ย้ายไประบบ "งานประจำ" (sop_task_records) และงานที่มอบหมายระบบใหม่
// (sop_work_projects) เลยไม่ขึ้นเลย. สองส่วนนี้ดึงของระบบใหม่มาโชว์ในแท็บเดียวกัน.

export type RoutineTab = "daily" | "weekly" | "monthly";

const FREQS: Record<RoutineTab, WorkFrequency[]> = {
  daily: ["daily", "once", "range"],
  weekly: ["weekly", "biweekly", "event"],
  monthly: ["monthly"]
};

const TAB_LABEL: Record<RoutineTab, string> = { daily: "วันนี้", weekly: "สัปดาห์นี้", monthly: "เดือนนี้" };

/** ช่วงวันที่ของแท็บ: วันเดียว · จันทร์–อาทิตย์ · ทั้งเดือน */
export function routineRange(tab: RoutineTab, workDate: string): { from: string; to: string } {
  if (tab === "daily") return { from: workDate, to: workDate };
  if (tab === "weekly") {
    const day = new Date(`${workDate}T12:00:00+07:00`).getUTCDay();
    const from = addDays(workDate, -((day + 6) % 7));
    return { from, to: addDays(from, 6) };
  }
  const from = `${workDate.slice(0, 7)}-01`;
  const next = addDays(`${workDate.slice(0, 7)}-28`, 4);
  return { from, to: addDays(`${next.slice(0, 7)}-01`, -1) };
}

type RoutineRow = { date: string; spec: WorkSpec; record: TaskRecord };

export function RoutineSubmissions({ branch, tab, workDate }: { branch: string; tab: RoutineTab; workDate: string }) {
  const [rows, setRows] = useState<RoutineRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    setRows(null);
    const { from, to } = routineRange(tab, workDate);
    fetchStoreTaskRange(branch, from, to)
      .then(({ tasks, recordsByDate }) => {
        if (!alive) return;
        const specs = new Map(tasks.map((spec) => [spec.id, spec]));
        const out: RoutineRow[] = [];
        for (const [date, done] of Object.entries(recordsByDate)) {
          for (const [taskId, record] of Object.entries(done)) {
            const spec = specs.get(taskId.split("::")[0]);
            if (spec && FREQS[tab].includes(spec.schedule.frequency)) out.push({ date, spec, record });
          }
        }
        setRows(out.sort((a, b) => b.record.at.localeCompare(a.record.at)));
      })
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [branch, tab, workDate]);

  const people = new Map<string, RoutineRow[]>();
  for (const row of rows || []) people.set(row.record.by, [...(people.get(row.record.by) || []), row]);

  return (
    <section className="mrev-new">
      <h3 className="mrev-new__title">
        งานประจำที่ส่ง{TAB_LABEL[tab]} <span>{rows ? rows.length : "…"}</span>
      </h3>
      {rows === null ? (
        <p className="mrev-new__empty">กำลังโหลด…</p>
      ) : rows.length === 0 ? (
        <p className="mrev-new__empty">ยังไม่มีงานประจำที่ส่ง{TAB_LABEL[tab]}</p>
      ) : (
        [...people.entries()].map(([by, list]) => (
          <details key={by} className="review-person is-green">
            <summary className="review-person__head">
              <span className="review-person__dot" aria-hidden />
              <strong>{displayNameFor(by)}</strong>
              <small>ส่ง {list.length} งาน</small>
            </summary>
            <div className="review-person__body">
              {list.map((row) => (
                <div key={`${row.date}-${row.spec.id}`} className="mrev-new__row">
                  <strong>{row.spec.title}</strong>
                  <small>
                    {thaiDate(row.date)} · ส่ง {thaiDateTime(row.record.at)}
                  </small>
                  {row.record.value ? <p>{row.record.value}</p> : null}
                  <Thumbs urls={row.record.photos} />
                </div>
              ))}
            </div>
          </details>
        ))
      )}
    </section>
  );
}

/** งานที่มอบหมาย (ระบบใหม่): รอตรวจทั้งหมด + ที่ส่งในวันที่เลือก → กดไปตรวจในแฟ้มงาน */
export function AssignedSubmissions({ branch, workDate }: { branch: string; workDate: string }) {
  const [rows, setRows] = useState<Array<{ project: WorkProject; code: string }> | null>(null);

  useEffect(() => {
    let alive = true;
    setRows(null);
    fetchProjectsForBranch(branch)
      .then((projects) => {
        if (!alive) return;
        setRows(
          projects.flatMap((project) =>
            project.assignees
              .filter((code) => {
                const state = taskState(project, code);
                return state === "submitted" || lastSubmissionFor(project, code)?.date === workDate;
              })
              .map((code) => ({ project, code }))
          )
        );
      })
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [branch, workDate]);

  return (
    <section className="mrev-new">
      <h3 className="mrev-new__title">
        งานที่มอบหมาย (ระบบใหม่) <span>{rows ? rows.length : "…"}</span>
      </h3>
      {rows === null ? (
        <p className="mrev-new__empty">กำลังโหลด…</p>
      ) : rows.length === 0 ? (
        <p className="mrev-new__empty">ไม่มีงานรอตรวจ</p>
      ) : (
        rows.map(({ project, code }) => {
          const sub = lastSubmissionFor(project, code);
          const waiting = taskState(project, code) === "submitted";
          return (
            <Link
              key={`${project.id}-${code}`}
              href={`/admin/task-review/${encodeURIComponent(code)}?month=${project.startDate.slice(0, 7)}`}
              className="ti-queue__item"
            >
              <span className={waiting ? "ti-dot ti-dot--amber" : "ti-dot ti-dot--green"} aria-hidden />
              <span>
                <strong>{project.title}</strong>
                <small>
                  {displayNameFor(code)} · {waiting ? "รอตรวจ" : "ตรวจแล้ว"}
                  {sub ? ` · ส่ง ${thaiDate(sub.date)}` : ""}
                </small>
              </span>
              <ChevronRight size={18} aria-hidden />
            </Link>
          );
        })
      )}
    </section>
  );
}
