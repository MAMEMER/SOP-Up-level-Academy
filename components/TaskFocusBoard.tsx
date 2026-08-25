"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  URGENCY_CLASS,
  URGENCY_LABEL,
  adminFollowUps,
  assignmentToFocusTask,
  buildFocusBoard,
  countdownLabel,
  deadlineLabel,
  projectToFocusTask,
  type FocusTask
} from "../lib/task-focus.ts";
import { fetchAssignmentsForStaff, type WorkAssignment } from "../lib/work-assignments-store.ts";
import { fetchProjectsForBranch, fetchProjectsForStaff } from "../lib/work-projects-store.ts";
import type { WorkProject } from "../lib/work-projects.ts";

/** นาฬิกาเดินสด — countdown ต้องขยับเองโดยไม่ต้องรีเฟรชหน้า */
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/**
 * กระดานงานที่ต้องทำตอนนี้ — ส่วนบนสุดของหน้าการทำงานหลัก (ใบงาน YrTvFzXr).
 * Staff เห็นเฉพาะงานของตัวเอง · แอดมินเลือกดูทั้งทีมได้ โดยแถบแรกยังเป็น "งานที่ต้องตามตอนนี้".
 */
export function TaskFocusBoard({
  branch,
  staffCode,
  today,
  scope = "staff"
}: {
  branch: string;
  /** staff ที่กำลังดูอยู่ (แอดมินดูทั้งทีม = ปล่อย null พร้อม scope="team") */
  staffCode: string | null;
  today: string;
  scope?: "staff" | "team";
}) {
  const now = useNow();
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  const [projects, setProjects] = useState<WorkProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [assignmentRows, projectRows] = await Promise.all([
        staffCode ? fetchAssignmentsForStaff(branch, staffCode).catch(() => [] as WorkAssignment[]) : Promise.resolve([] as WorkAssignment[]),
        (scope === "team" ? fetchProjectsForBranch(branch) : staffCode ? fetchProjectsForStaff(branch, staffCode) : Promise.resolve([])).catch(
          () => [] as WorkProject[]
        )
      ]);
      setAssignments(assignmentRows);
      setProjects(projectRows);
    } finally {
      setLoading(false);
    }
  }, [branch, staffCode, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const board = useMemo(() => {
    const tasks = [
      ...assignments.map((assignment) => assignmentToFocusTask(assignment, now, today)),
      ...projects.map((project) => projectToFocusTask(project, now, today))
    ];
    return buildFocusBoard(tasks);
  }, [assignments, projects, now, today]);

  const followUps = scope === "team" ? adminFollowUps(board) : [];
  const total = board.now.length + board.waiting.length;

  return (
    <section className="focus-board">
      <div className="focus-board__strip" role="list">
        <StripItem label="เกินกำหนด" count={board.counts.overdue} tone="focus-red" />
        <StripItem label={`ใกล้ครบ (30 นาที)`} count={board.counts.dueSoon} tone="focus-orange" />
        <StripItem label="ต้องทำวันนี้" count={board.counts.today} tone="focus-yellow" />
        <StripItem label="กำลังทำ" count={board.counts.inProgress} tone="focus-blue" />
      </div>

      {loading ? (
        <p className="focus-board__empty">กำลังโหลดงาน…</p>
      ) : total === 0 ? (
        <p className="focus-board__empty">ไม่มีงานค้าง — เคลียร์หมดแล้ว</p>
      ) : (
        <>
          {scope === "team" && followUps.length ? (
            <div className="focus-board__group">
              <p className="focus-board__group-label">ต้องตามตอนนี้ ({followUps.length})</p>
              <TaskList tasks={followUps} now={now} today={today} showOwner />
            </div>
          ) : null}

          <div className="focus-board__group">
            <p className="focus-board__group-label">
              {scope === "team" ? `งานของทีมทั้งหมด (${board.now.length})` : `ต้องทำตอนนี้ (${board.now.length})`}
            </p>
            {board.now.length ? (
              <TaskList tasks={board.now} now={now} today={today} showOwner={scope === "team"} />
            ) : (
              <p className="focus-board__empty">ไม่มีงานค้าง</p>
            )}
          </div>

          {board.waiting.length && scope !== "team" ? (
            <div className="focus-board__group">
              <p className="focus-board__group-label">ส่งแล้ว รอตรวจ ({board.waiting.length})</p>
              <TaskList tasks={board.waiting} now={now} today={today} showOwner={false} />
            </div>
          ) : null}
        </>
      )}

      {board.done.length ? (
        <div className="focus-board__done">
          <button type="button" className="focus-board__toggle" onClick={() => setShowDone((value) => !value)} aria-expanded={showDone}>
            {showDone ? "ซ่อนงานที่เสร็จแล้ว" : `งานที่เสร็จแล้ว (${board.done.length})`}
          </button>
          {showDone ? <TaskList tasks={board.done} now={now} today={today} showOwner={scope === "team"} /> : null}
        </div>
      ) : null}
    </section>
  );
}

function StripItem({ label, count, tone }: { label: string; count: number; tone: string }) {
  return (
    <div className={`focus-strip__item ${tone}${count === 0 ? " is-zero" : ""}`} role="listitem">
      <strong>{count}</strong>
      <span>{label}</span>
    </div>
  );
}

function TaskList({ tasks, now, today, showOwner }: { tasks: FocusTask[]; now: number; today: string; showOwner: boolean }) {
  return (
    <ul className="focus-list">
      {tasks.map((task) => (
        <li key={`${task.source}-${task.id}`} className={`focus-card ${URGENCY_CLASS[task.urgency]}`}>
          <div className="focus-card__main">
            <p className="focus-card__title">{task.title}</p>
            <p className="focus-card__meta">
              <span className="focus-card__status">{URGENCY_LABEL[task.urgency]}</span>
              <span>{deadlineLabel(task, today)}</span>
              {task.urgency === "done" ? null : <span className="focus-card__count">{countdownLabel(task.dueAt, now)}</span>}
              {showOwner ? <span>{task.ownerLabel}</span> : null}
            </p>
            {task.note ? <p className="focus-card__note">{task.note}</p> : null}
          </div>
          <Link href={task.href} className="focus-card__cta">
            {task.ctaLabel}
          </Link>
        </li>
      ))}
    </ul>
  );
}
