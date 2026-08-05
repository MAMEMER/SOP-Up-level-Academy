"use client";

import { useEffect, useState } from "react";
import { effectiveAssignedWorkStatus, isAssignedWorkPastDeadline } from "../lib/assigned-work-status.ts";
import { stockWorkSummaryCards, type WorkflowPhase } from "../lib/card-store-workflow.ts";
import { weeklyStockSleevePhase } from "../lib/weekly-stock-workflow.ts";
import type { AssignedWorkRecord } from "../lib/performance-service-records.ts";
import { groupAssignedWorkRecords } from "../lib/performance-service-records.ts";
import type { AssignedWorkFeedItem } from "../lib/assigned-work-feed.ts";
import { groupAssignedWorkFeed } from "../lib/assigned-work-feed.ts";
import { formatWorkDate, workflowVisualStatus } from "../lib/workflow-records.ts";
import { useWorkflowRecords } from "../lib/workflow-records-client.ts";
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
import { fetchMonthlyEventPayload } from "../lib/monthly-event-store.ts";
import {
  isWeeklyEventActiveOn,
  weeklyEventCompleted,
  weeklyEventDaysLabel,
  weeklyEventHref,
  weeklyEvents,
  type WeeklyEvent
} from "../lib/weekly-event-tasks.ts";
import { fetchWeeklyEventPayload, tickKey, weeklyEventPeriodKey } from "../lib/weekly-event-store.ts";

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

type WorkflowStatusClass =
  | "workflow-status-white"
  | "workflow-status-orange"
  | "workflow-status-green"
  | "workflow-status-red";

// Collapse the per-assignee colours of a team task into one card colour: green only when
// everyone is done, red if anyone needs attention, orange while some are in progress,
// white when nothing has started yet.
function foldStatusClass(classes: string[]): WorkflowStatusClass {
  if (classes.length > 0 && classes.every((c) => c === "workflow-status-green")) return "workflow-status-green";
  if (classes.includes("workflow-status-red")) return "workflow-status-red";
  if (classes.some((c) => c === "workflow-status-orange" || c === "workflow-status-green")) return "workflow-status-orange";
  return "workflow-status-white";
}

export function DashboardTaskSections({
  phases,
  assignedWorkRecords = [],
  assignedWorkFeed = [],
  workDate: currentWorkDate,
  canManageAssignedWork = false
}: {
  phases: WorkflowPhase[];
  assignedWorkRecords?: AssignedWorkRecord[];
  assignedWorkFeed?: AssignedWorkFeedItem[];
  workDate?: string;
  canManageAssignedWork?: boolean;
}) {
  const { records } = useWorkflowRecords();
  const [monthlyStatus, setMonthlyStatus] = useState<Record<string, MonthlyTaskStatus>>({});
  const [monthLabel, setMonthLabel] = useState<string>("");
  const [weeklyTicks, setWeeklyTicks] = useState<Record<string, boolean>>({});
  const [weeklyPeriodKey, setWeeklyPeriodKey] = useState<string>("");
  const workDate = currentWorkDate || formatWorkDate();
  // งานที่มอบหมาย: รวมงานเดียวกันที่มอบหลายคนให้เหลือหัวข้อเดียว (UI เท่านั้น — การให้คะแนนแยกตามเดิม)
  const assignedRecordGroups = groupAssignedWorkRecords(assignedWorkRecords);
  const assignedFeedGroups = groupAssignedWorkFeed(assignedWorkFeed);
  const stockPhase = phases.find((phase) => phase.id === "stock-work");
  const dailyTaskPhases = phases.filter((phase) => phase.id !== "stock-work");

  // งานประจำเดือน: คำนวณสถานะฝั่ง client เท่านั้น (กัน hydration mismatch จาก new Date())
  // สถานะมาจาก server record เดียวกับหน้า /monthly-tasks
  useEffect(() => {
    let alive = true;
    const now = new Date();
    const monthKey = bangkokMonthKey(now);
    fetchMonthlyEventPayload(monthKey)
      .then((payload) => {
        if (!alive) return;
        const occurrences = monthlyTaskOccurrences(monthKey, payload.states, undefined, now);
        const statusByTask: Record<string, MonthlyTaskStatus> = {};
        for (const occurrence of occurrences) statusByTask[occurrence.taskId] = occurrence.status;
        setMonthlyStatus(statusByTask);
        setMonthLabel(occurrences[0]?.monthLabel ?? "");
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // Weekly event checklist: อ่านความคืบหน้า (ติ๊กกี่ข้อ) ของสัปดาห์นี้จาก server record
  useEffect(() => {
    let alive = true;
    const key = weeklyEventPeriodKey(workDate);
    setWeeklyPeriodKey(key);
    fetchWeeklyEventPayload(key)
      .then((payload) => alive && setWeeklyTicks(payload.ticks))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [workDate]);

  function weeklyEventTickedMap(event: WeeklyEvent): Record<string, boolean> {
    const map: Record<string, boolean> = {};
    if (!weeklyPeriodKey) return map;
    for (const item of event.checklist) map[item.id] = Boolean(weeklyTicks[tickKey(weeklyPeriodKey, event.id, item.id)]);
    return map;
  }

  // งานกิจกรรมที่ "ถึงกำหนด" ในวันนี้เท่านั้น → ขึ้นเป็น Assigned work + ลิงก์ส่งงาน/หลักฐาน
  // งานที่ยังไม่ถึงกำหนดจะไม่ถูกนับเป็น assigned work (โชว์สีเทาในหมวด Weekly task แทน)
  const activeWeeklyEvents = weeklyEvents.filter((event) => isWeeklyEventActiveOn(event, workDate));

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
          {assignedWorkRecords.length || assignedWorkFeed.length || activeWeeklyEvents.length ? (
            <>
              {assignedRecordGroups.map((group, index) => {
                const canShowStatus = canManageAssignedWork || isAssignedWorkPastDeadline(group.workDate);
                // งานเดี่ยว → การ์ดเดิม (คงรายละเอียด tracking/หลักฐาน ครบเหมือนก่อน)
                if (!group.isTeam) {
                  const record = group.members[0];
                  const effectiveStatus = effectiveAssignedWorkStatus(record);
                  return (
                    <a
                      key={group.key}
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
                }
                // งานเดียวกันมอบหลายคน → รวมเป็นการ์ดเดียว + แสดงรายชื่อผู้รับด้านใน (แต่ละคนยังถูกให้คะแนนแยกตามเดิม)
                const memberClasses = group.members.map((member) =>
                  canShowStatus ? assignedStatusClass[effectiveAssignedWorkStatus(member)] : "workflow-status-white"
                );
                const overallClass = foldStatusClass(memberClasses);
                const doneCount = memberClasses.filter((c) => c === "workflow-status-green").length;
                return (
                  <a
                    key={group.key}
                    href={`/assigned-work/${encodeURIComponent(group.primaryId)}`}
                    className={`daily-phase-card ${overallClass}`}
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <small>งานทีม · {group.members.length} คน · {group.workDate}</small>
                      <strong>{group.title}</strong>
                      <em>{canShowStatus ? `เสร็จ ${doneCount}/${group.members.length}` : "รอส่งงาน"}</em>
                      <em>
                        {group.members
                          .map((member) => `${member.employeeName} (${canShowStatus ? assignedStatusText[effectiveAssignedWorkStatus(member)] : "รอส่งงาน"})`)
                          .join(" · ")}
                      </em>
                    </div>
                  </a>
                );
              })}
              {assignedFeedGroups.map((group, index) => {
                const seq = assignedRecordGroups.length + index + 1;
                // งานเดี่ยว / งานส่งต่อ → การ์ดเดิม
                if (!group.isTeam) {
                  const member = group.members[0];
                  return (
                    <a key={group.key} href={group.href} className={`daily-phase-card ${member.statusClass}`}>
                      <span>{String(seq).padStart(2, "0")}</span>
                      <div>
                        <small>{member.label} · {group.workDate}</small>
                        <strong>{group.title}</strong>
                        <em>{group.originLabel} · {member.statusText}</em>
                        {group.detail ? <em>{group.detail}</em> : null}
                      </div>
                    </a>
                  );
                }
                // งานเดียวกันมอบหลายคน → รวมเป็นการ์ดเดียว
                const overallClass = foldStatusClass(group.members.map((member) => member.statusClass));
                const doneCount = group.members.filter((member) => member.statusClass === "workflow-status-green").length;
                return (
                  <a key={group.key} href={group.href} className={`daily-phase-card ${overallClass}`}>
                    <span>{String(seq).padStart(2, "0")}</span>
                    <div>
                      <small>งานทีม · {group.members.length} คน · {group.workDate}</small>
                      <strong>{group.title}</strong>
                      <em>{group.originLabel} · เสร็จ {doneCount}/{group.members.length}</em>
                      <em>{group.members.map((member) => `${member.label} (${member.statusText})`).join(" · ")}</em>
                      {group.detail ? <em>{group.detail}</em> : null}
                    </div>
                  </a>
                );
              })}
              {activeWeeklyEvents.map((event, index) => {
                const completed = weeklyEventCompleted(event, weeklyEventTickedMap(event));
                const total = event.checklist.length;
                const done = completed === total && completed > 0;
                const seq = assignedRecordGroups.length + assignedFeedGroups.length + index + 1;
                return (
                  <a
                    key={`weekly-${event.id}`}
                    href={weeklyEventHref(event.id)}
                    className={`daily-phase-card ${done ? "workflow-status-green" : "workflow-status-white"}`}
                  >
                    <span>{done ? "✓" : String(seq).padStart(2, "0")}</span>
                    <div>
                      <small>Weekly event · {event.game} · {workDate}</small>
                      <strong>{event.name}</strong>
                      <em>ถึงกำหนดวันนี้ · ส่งงาน/หลักฐาน · {completed}/{total}</em>
                    </div>
                  </a>
                );
              })}
            </>
          ) : (
            <a
              href={canManageAssignedWork ? `/admin/performance-score?startDate=${workDate}&endDate=${workDate}` : "#assigned-work"}
              className="daily-phase-card workflow-status-white"
            >
              <span>00</span>
              <div>
                <small>{workDate}</small>
                <strong>ยังไม่มีงานที่มอบหมายวันนี้</strong>
                <em>เพิ่มจากหน้า Performance หรือหน้า มอบหมายงาน แล้วงานจะขึ้นบน dashboard ทันที</em>
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
          <a className="status-pill" href={weeklyEventHref()}>
            เปิด checklist
          </a>
        </div>
        <div className="daily-phase-grid">
          {weeklyEvents.map((event, index) => {
            const completed = weeklyEventCompleted(event, weeklyEventTickedMap(event));
            const total = event.checklist.length;
            const done = completed === total && completed > 0;
            const active = isWeeklyEventActiveOn(event, workDate);
            // ยังไม่ถึงวันจัด → โชว์สีเทา (muted) และไม่นับเป็น assigned work
            const statusClass = !active ? "workflow-status-white is-muted" : done ? "workflow-status-green" : "workflow-status-white";
            const cardInner = (
              <>
                <span>{done ? "✓" : String(index + 1).padStart(2, "0")}</span>
                <div>
                  <small>Weekly event · {event.game}</small>
                  <strong>{event.name}</strong>
                  {active ? (
                    <em>ถึงกำหนดวันนี้ · {event.schedule} · {completed}/{total}</em>
                  ) : (
                    <em>🔒 ยังไม่ถึงกำหนด · จัดวัน{weeklyEventDaysLabel(event)}</em>
                  )}
                </div>
              </>
            );
            // ยังไม่ถึงวันจัด → ปิดการกด (render เป็น div ไม่ใช่ลิงก์) ห้ามเข้าไปทำ
            if (!active) {
              return (
                <div
                  key={event.id}
                  className={`daily-phase-card ${statusClass} is-locked`}
                  aria-disabled="true"
                >
                  {cardInner}
                </div>
              );
            }
            return (
              <a
                key={event.id}
                href={weeklyEventHref(event.id)}
                className={`daily-phase-card ${statusClass}`}
              >
                {cardInner}
              </a>
            );
          })}
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
