"use client";

import { useEffect, useState } from "react";
import { effectiveAssignedWorkStatus, isAssignedWorkPastDeadline } from "../lib/assigned-work-status.ts";
import { stockWorkSummaryCards, type WorkflowPhase } from "../lib/card-store-workflow.ts";
import { weeklyStockSleevePhase } from "../lib/weekly-stock-workflow.ts";
import type { AssignedWorkRecord } from "../lib/performance-service-records.ts";
import {
  canPersistWorkflowRecords,
  formatWorkDate,
  phaseScheduleForWorkDate,
  readWorkflowRecordsFromStorage,
  upsertWorkflowRecord,
  workflowStorageKey,
  workflowVisualStatus,
  type WorkflowDailyRecord
} from "../lib/workflow-records.ts";
import {
  bangkokMonthKey,
  monthlyStockTasks,
  monthlyTaskOccurrences,
  monthlyTaskStatusClass,
  monthlyTaskStatusText,
  monthlyTasks,
  monthlyTasksSubmitHref,
  type MonthlyTaskStatus
} from "../lib/monthly-event-tasks.ts";
import { readMonthlyEventStates } from "../lib/monthly-event-store.ts";

const statusText = {
  white: "ยังไม่เริ่ม",
  green: "ตรงเวลา",
  orange: "เกินเวลา",
  red: "เลยเวลา",
  purple: "ต่อเนื่อง 3 วัน"
};

const assignedStatusText: Record<AssignedWorkRecord["status"], string> = {
  early_quality: "เสร็จก่อนกำหนด",
  on_time: "เสร็จตรงเวลา",
  needs_revision: "ต้องแก้ไข",
  late_one_day: "ช้าไม่เกิน 1 วัน",
  not_finished: "ยังไม่เสร็จ"
};

const assignedStatusClass: Record<AssignedWorkRecord["status"], string> = {
  early_quality: "workflow-status-green",
  on_time: "workflow-status-green",
  needs_revision: "workflow-status-orange",
  late_one_day: "workflow-status-orange",
  not_finished: "workflow-status-red"
};

const weeklyEventTasks = [
  { id: "weekly-event-tournament", name: "Tournament", schedule: "สัปดาห์สุดท้ายของเดือน", shiftIds: ["morning", "afternoon"] },
  { id: "weekly-event-lorcana", name: "ป้ายยา Lorcana", schedule: "สัปดาห์แรก และสัปดาห์ที่ 3 ของเดือน", shiftIds: ["morning", "afternoon"] }
];

export function DashboardTaskSections({
  phases,
  assignedWorkRecords = [],
  workDate: currentWorkDate,
  canManageAssignedWork = false
}: {
  phases: WorkflowPhase[];
  assignedWorkRecords?: AssignedWorkRecord[];
  workDate?: string;
  canManageAssignedWork?: boolean;
}) {
  const [records, setRecords] = useState<WorkflowDailyRecord[]>([]);
  const [monthlyStatus, setMonthlyStatus] = useState<Record<string, MonthlyTaskStatus>>({});
  const [monthLabel, setMonthLabel] = useState<string>("");
  const workDate = currentWorkDate || formatWorkDate();
  const stockPhase = phases.find((phase) => phase.id === "stock-work");
  const dailyTaskPhases = phases.filter((phase) => phase.id !== "stock-work");

  useEffect(() => {
    const storedRecords = readWorkflowRecordsFromStorage(window.localStorage);
    const now = new Date();
    const recordsWithMissed = phases.reduce((current, phase) => {
      const existing = current.find((item) => item.workDate === workDate && item.phaseId === phase.id);
      if (existing?.status === "submitted" || existing?.status === "missed") return current;

      const schedule = phaseScheduleForWorkDate(phase.id, workDate);
      if (Date.parse(schedule.dueAt) >= now.getTime()) return current;

      return upsertWorkflowRecord(current, {
        workDate,
        phaseId: phase.id,
        phaseTitle: phase.title,
        completed: existing?.completed || 0,
        total: phase.checklist.length,
        status: "missed",
        recordedAt: now.toISOString(),
        startedAt: existing?.startedAt,
        dueAt: schedule.dueAt,
        scheduleStartAt: schedule.startAt,
        scheduleEndAt: schedule.endAt,
        checkedKeys: existing?.checkedKeys || []
      });
    }, storedRecords);

    setRecords(recordsWithMissed);
    if (canPersistWorkflowRecords() && recordsWithMissed !== storedRecords) {
      window.localStorage.setItem(workflowStorageKey, JSON.stringify(recordsWithMissed));
    }
  }, [phases, workDate]);

  // งานประจำเดือน: คำนวณสถานะฝั่ง client เท่านั้น (กัน hydration mismatch จาก new Date())
  useEffect(() => {
    const now = new Date();
    const occurrences = monthlyTaskOccurrences(bangkokMonthKey(now), readMonthlyEventStates(), undefined, now);
    const statusByTask: Record<string, MonthlyTaskStatus> = {};
    for (const occurrence of occurrences) statusByTask[occurrence.taskId] = occurrence.status;
    setMonthlyStatus(statusByTask);
    setMonthLabel(occurrences[0]?.monthLabel ?? "");
  }, []);

  return (
    <section className="task-sections">
      <article id="assigned-work" className="task-section assigned-work-task">
        <div className="task-section-head">
          <div>
            <p className="eyebrow">Assigned work</p>
            <h3>งานที่มอบหมาย</h3>
          </div>
          {canManageAssignedWork ? (
            <a className="status-pill" href={`/admin/performance-score?startDate=${workDate}&endDate=${workDate}`}>
              บันทึกงาน
            </a>
          ) : null}
        </div>
        <div className="daily-phase-grid">
          {assignedWorkRecords.length ? (
            assignedWorkRecords.map((record, index) => {
              const effectiveStatus = effectiveAssignedWorkStatus(record);
              const canShowStatus = canManageAssignedWork || isAssignedWorkPastDeadline(record.workDate);
              return (
                <a
                  key={record.id}
                  href={`/assigned-work/${encodeURIComponent(record.id)}`}
                  className={`daily-phase-card ${canShowStatus ? assignedStatusClass[effectiveStatus] : "workflow-status-white"}`}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <small>{record.employeeName} · {record.workDate}</small>
                    <strong>{record.title}</strong>
                    <em>{canShowStatus ? assignedStatusText[effectiveStatus] : "รอส่งงาน"}{record.note ? ` · ${record.note}` : ""}</em>
                    {record.trackingNumber ? <em>Tracking: {record.trackingNumber}</em> : null}
                    {record.imageEvidence?.length ? <em>รูปหลักฐาน: {record.imageEvidence.join(", ")}</em> : null}
                    {record.evidence ? <em>หลักฐาน: {record.evidence}</em> : null}
                  </div>
                </a>
              );
            })
          ) : (
            <a
              href={canManageAssignedWork ? `/admin/performance-score?startDate=${workDate}&endDate=${workDate}` : "#assigned-work"}
              className="daily-phase-card workflow-status-white"
            >
              <span>00</span>
              <div>
                <small>{workDate}</small>
                <strong>ยังไม่มีงานที่มอบหมายวันนี้</strong>
                <em>เพิ่มจากหน้า Performance แล้วงานจะขึ้นบน dashboard ทันที</em>
              </div>
            </a>
          )}
        </div>
      </article>

      <article id="daily-task" className="task-section daily-task">
        <div className="task-section-head">
          <div>
            <p className="eyebrow">Daily</p>
            <h3>Daily task</h3>
          </div>
        </div>
        <div className="daily-phase-grid">
          {dailyTaskPhases.map((phase, index) => {
            const visualStatus = workflowVisualStatus(records, workDate, phase.id);
            const record = records.find((item) => item.workDate === workDate && item.phaseId === phase.id);
            const submitted = record?.status === "submitted";
            return (
              <a
                key={phase.id}
                href={`/checklist#${phase.id}`}
                className={`daily-phase-card workflow-status-${visualStatus}`}
              >
                <span>{submitted ? "✓" : String(index + 1).padStart(2, "0")}</span>
                <div>
                  <small>{phase.timeLabel}</small>
                  <strong>{phase.title}</strong>
                  <em>{statusText[visualStatus]} · {record ? `${record.completed}/${record.total}` : `0/${phase.checklist.length}`}</em>
                </div>
              </a>
            );
          })}
        </div>
      </article>

      {stockPhase ? (
        <article className="task-section stock-task">
          <div className="task-section-head">
            <div>
              <p className="eyebrow">Stock</p>
              <h3>Stock work</h3>
            </div>
          </div>
          <div className="daily-phase-grid">
            {(() => {
              const visualStatus = workflowVisualStatus(records, workDate, stockPhase.id);
              const record = records.find((item) => item.workDate === workDate && item.phaseId === stockPhase.id);
              const submitted = record?.status === "submitted";
              return (
                <a href="/checklist#stock-work" className={`daily-phase-card workflow-status-${visualStatus}`}>
                  <span>{submitted ? "✓" : "01"}</span>
                  <div>
                    <small>{stockWorkSummaryCards[0].kicker}</small>
                    <strong>{stockWorkSummaryCards[0].title}</strong>
                    <em>{statusText[visualStatus]} · {record ? `${record.completed}/${record.total}` : `0/${stockPhase.checklist.length}`}</em>
                  </div>
                </a>
              );
            })()}
            <a href="/checklist-weekly#stock-sleeve-work" className="daily-phase-card workflow-status-white" id="stock-weekly">
              <span>02</span>
              <div>
                <small>{stockWorkSummaryCards[1].kicker}</small>
                <strong>{stockWorkSummaryCards[1].title}</strong>
                <em>ยังไม่เริ่ม · 0/{weeklyStockSleevePhase.checklist.length}</em>
              </div>
            </a>
            <a href="/checklist-monthly#stock-single-card-work" className="daily-phase-card workflow-status-white" id="stock-monthly">
              <span>03</span>
              <div>
                <small>{stockWorkSummaryCards[2].kicker}</small>
                <strong>{stockWorkSummaryCards[2].title}</strong>
                <em>ยังไม่เริ่ม · 0/{monthlyStockTasks.length}</em>
              </div>
            </a>
          </div>
        </article>
      ) : null}

      <article id="weekly-task" className="task-section weekly-task">
        <div className="task-section-head">
          <div>
            <p className="eyebrow">Weekly</p>
            <h3>Weekly task</h3>
          </div>
          <span className="status-pill">ภาพรวม</span>
        </div>
        <div className="daily-phase-grid">
          {weeklyEventTasks.map((task, index) => (
            <a key={task.id} href="#weekly-task" className="daily-phase-card workflow-status-white">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <small>Weekly</small>
                <strong>{task.name}</strong>
                <em>{task.schedule}</em>
              </div>
            </a>
          ))}
        </div>
      </article>

      <article id="monthly-task" className="task-section monthly-task">
        <div className="task-section-head">
          <div>
            <p className="eyebrow">Monthly</p>
            <h3>Monthly task</h3>
          </div>
          <a className="status-pill" href={monthlyTasksSubmitHref()}>
            {canManageAssignedWork ? "จัดการ / ตรวจงาน" : "ส่งงาน"}
          </a>
        </div>
        <div className="daily-phase-grid">
          {monthlyTasks.map((task, index) => {
            const status = monthlyStatus[task.id] ?? "not_started";
            const done = status === "done";
            return (
              <a
                key={task.id}
                href={monthlyTasksSubmitHref(task.id)}
                className={`daily-phase-card ${monthlyTaskStatusClass[status]}`}
              >
                <span>{done ? "✓" : String(index + 1).padStart(2, "0")}</span>
                <div>
                  <small>{task.category === "event" ? "งานอีเว้นต์" : "งาน Stock"}{monthLabel ? ` · ${monthLabel}` : ""}</small>
                  <strong>{task.name}</strong>
                  <em>{monthlyTaskStatusText[status]} · {task.schedule}</em>
                </div>
              </a>
            );
          })}
        </div>
      </article>
    </section>
  );
}
