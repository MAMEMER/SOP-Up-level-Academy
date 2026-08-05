"use client";

import { useEffect, useState, type ReactNode } from "react";
import { effectiveAssignedWorkStatus, isAssignedWorkPastDeadline } from "../lib/assigned-work-status.ts";
import { stockWorkSummaryCards, type WorkflowPhase } from "../lib/card-store-workflow.ts";
import { weeklyStockTasks } from "../lib/weekly-stock-workflow.ts";
import type { AssignedWorkRecord } from "../lib/performance-service-records.ts";
import type { AssignedWorkFeedItem } from "../lib/assigned-work-feed.ts";
import { formatWorkDate, workflowVisualStatus } from "../lib/workflow-records.ts";
import { useWorkflowRecords } from "../lib/workflow-records-client.ts";
import { useShiftPhases } from "../lib/use-shift-phases.ts";
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

export function DashboardTaskSections({
  phases,
  assignedWorkRecords = [],
  assignedWorkFeed = [],
  workDate: currentWorkDate,
  canManageAssignedWork = false,
  staffCode = null,
  branch
}: {
  phases: WorkflowPhase[];
  assignedWorkRecords?: AssignedWorkRecord[];
  assignedWorkFeed?: AssignedWorkFeedItem[];
  workDate?: string;
  canManageAssignedWork?: boolean;
  /** The staffer this dashboard belongs to — used to show only their กะ's daily หัวข้อ. */
  staffCode?: string | null;
  branch?: string;
}) {
  const { records } = useWorkflowRecords();
  const [monthlyStatus, setMonthlyStatus] = useState<Record<string, MonthlyTaskStatus>>({});
  const [monthLabel, setMonthLabel] = useState<string>("");
  const [weeklyTicks, setWeeklyTicks] = useState<Record<string, boolean>>({});
  const [weeklyPeriodKey, setWeeklyPeriodKey] = useState<string>("");
  const workDate = currentWorkDate || formatWorkDate();
  // เฉพาะ หัวข้อ ของกะที่พนักงานคนนี้เข้าวันนี้ — กะ2 จะไม่เห็น เปิดร้าน (ของกะ1) ขึ้นว่าเลยเวลา
  // Admin / วันหยุด → คืนทุก หัวข้อ (hook ไม่กรอง)
  const shiftPhases = useShiftPhases(phases, staffCode, branch, workDate);
  const stockPhase = shiftPhases.find((phase) => phase.id === "stock-work");
  const dailyTaskPhases = shiftPhases.filter((phase) => phase.id !== "stock-work");

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
              {assignedWorkRecords.map((record, index) => {
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
              })}
              {assignedWorkFeed.map((item, index) => (
                <a key={item.id} href={item.href} className={`daily-phase-card ${item.statusClass}`}>
                  <span>{String(assignedWorkRecords.length + index + 1).padStart(2, "0")}</span>
                  <div>
                    <small>{item.assigneeLabel} · {item.workDate}</small>
                    <strong>{item.title}</strong>
                    <em>{item.originLabel} · {item.statusText}</em>
                    {item.detail ? <em>{item.detail}</em> : null}
                  </div>
                </a>
              ))}
              {activeWeeklyEvents.map((event, index) => {
                const completed = weeklyEventCompleted(event, weeklyEventTickedMap(event));
                const total = event.checklist.length;
                const done = completed === total && completed > 0;
                const seq = assignedWorkRecords.length + assignedWorkFeed.length + index + 1;
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

      {/* Stock work: Daily / Weekly / Monthly เป็นกลุ่มงานแยกชัดเจน ใช้ pattern เดียวกับแถบงานอื่น
          Weekly + Monthly stock แสดงเสมอ (ไม่ผูกกับกะรายวัน) ส่วน Daily stock ขึ้นเฉพาะเมื่อกะมี stock-work */}
      <article className="task-section stock-task">
        <div className="task-section-head">
          <div>
            <p className="eyebrow">Stock</p>
            <h3>Stock work</h3>
          </div>
        </div>
        <div className="daily-phase-grid">
          {(() => {
            const cards: ReactNode[] = [];
            let seq = 0;

            // 01 · Daily stock (น้ำ/ขนม) — เฉพาะกะที่มีงาน stock-work วันนี้
            if (stockPhase) {
              seq += 1;
              const visualStatus = workflowVisualStatus(records, workDate, stockPhase.id);
              const record = records.find((item) => item.workDate === workDate && item.phaseId === stockPhase.id);
              const submitted = record?.status === "submitted";
              cards.push(
                <a key="stock-daily" href="/checklist#stock-work" className={`daily-phase-card workflow-status-${visualStatus}`} id="stock-daily">
                  <span>{submitted ? "✓" : String(seq).padStart(2, "0")}</span>
                  <div>
                    <small>{stockWorkSummaryCards[0].kicker}</small>
                    <strong>{stockWorkSummaryCards[0].title}</strong>
                    <em>{statusText[visualStatus]} · {record ? `${record.completed}/${record.total}` : `0/${stockPhase.checklist.length}`}</em>
                  </div>
                </a>
              );
            }

            // Weekly stock — data-driven จาก weeklyStockTasks (แก้/เพิ่ม/ลบ ที่ lib ได้เลย)
            weeklyStockTasks.forEach((task, index) => {
              seq += 1;
              cards.push(
                <a
                  key={task.id}
                  href={task.href}
                  className="daily-phase-card workflow-status-white"
                  id={index === 0 ? "stock-weekly" : undefined}
                >
                  <span>{String(seq).padStart(2, "0")}</span>
                  <div>
                    <small>{stockWorkSummaryCards[1].kicker}</small>
                    <strong>{task.name}</strong>
                    <em>{task.note ? `ยังไม่เริ่ม · ${task.note}` : "ยังไม่เริ่ม"}</em>
                  </div>
                </a>
              );
            });

            // Monthly stock — สรุปเป็นการ์ดเดียว ลิงก์ไป checklist งานประจำเดือน (Single card)
            seq += 1;
            cards.push(
              <a key="stock-monthly" href="/checklist-monthly#stock-single-card-work" className="daily-phase-card workflow-status-white" id="stock-monthly">
                <span>{String(seq).padStart(2, "0")}</span>
                <div>
                  <small>{stockWorkSummaryCards[2].kicker}</small>
                  <strong>{stockWorkSummaryCards[2].title}</strong>
                  <em>ยังไม่เริ่ม · 0/{monthlyStockTasks.length}</em>
                </div>
              </a>
            );

            return cards;
          })()}
        </div>
      </article>

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
