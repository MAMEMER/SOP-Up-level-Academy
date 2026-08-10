"use client";

// The single "งานวันนี้ทั้งหมด" board at the top of the staff dashboard: daily หัวข้อ of
// the กะ they work, Stock work planned on the shift grid, today's weekly event, this
// month's งานประจำเดือน, and everything assigned or handed over to them — merged and
// ranked by what is late / due / coming / done (see lib/today-work-board.ts).
//
// The per-source sections below it stay as the detail view; this is the answer to
// "ตกลงวันนี้ต้องทำอะไรบ้าง" without reading five grids.

import { useEffect, useState } from "react";
import { effectiveAssignedWorkStatus, isAssignedWorkPastDeadline } from "../lib/assigned-work-status.ts";
import type { WorkflowPhase } from "../lib/card-store-workflow.ts";
import type { AssignedWorkRecord } from "../lib/performance-service-records.ts";
import type { AssignedWorkFeedItem } from "../lib/assigned-work-feed.ts";
import { formatWorkDate, workflowVisualStatus } from "../lib/workflow-records.ts";
import { useWorkflowRecords } from "../lib/workflow-records-client.ts";
import { useShiftPhases } from "../lib/use-shift-phases.ts";
import { usePlannedStockWork } from "../lib/use-planned-day-tasks.ts";
import { plannedStatusText } from "../lib/planned-day-tasks.ts";
import {
  bangkokMonthKey,
  monthlyTaskOccurrences,
  monthlyTasksSubmitHref,
  type MonthlyTaskOccurrence
} from "../lib/monthly-event-tasks.ts";
import { fetchMonthlyEventPayload } from "../lib/monthly-event-store.ts";
import { isWeeklyEventActiveOn, weeklyEventCompleted, weeklyEventHref, weeklyEvents } from "../lib/weekly-event-tasks.ts";
import { fetchWeeklyEventPayload, tickKey, weeklyEventPeriodKey } from "../lib/weekly-event-store.ts";
import { buildTodayWorkBoard, todayWorkHeadline } from "../lib/today-work-board.ts";
import { deliveryStatusText, deliveryTaskState, type DeliveryTask } from "../lib/delivery-tasks.ts";

export function TodayWorkBoard({
  phases,
  assignedWorkRecords = [],
  assignedWorkFeed = [],
  deliveryTasks = [],
  workDate: currentWorkDate,
  canManageAssignedWork = false,
  staffCode = null,
  branch
}: {
  phases: WorkflowPhase[];
  assignedWorkRecords?: AssignedWorkRecord[];
  assignedWorkFeed?: AssignedWorkFeedItem[];
  /** ออเดอร์เว็บกิลด์ที่ต้องส่ง — server render มาให้แล้ว (ดู DeliveryOrdersBoard) */
  deliveryTasks?: DeliveryTask[];
  workDate?: string;
  canManageAssignedWork?: boolean;
  staffCode?: string | null;
  branch?: string;
}) {
  const workDate = currentWorkDate || formatWorkDate();
  const { records } = useWorkflowRecords();
  // วันหยุด/ไม่มีกะ → หัวข้อรายวันไม่ใช่งานของเขาวันนั้น จึงไม่ขึ้นในกระดานนี้ (ดูได้ในหมวดด้านล่าง)
  const { phases: shiftPhases, offDay, offLabel } = useShiftPhases(phases, staffCode, branch, workDate);
  const plannedStock = usePlannedStockWork(branch, workDate);
  const [monthlyOccurrences, setMonthlyOccurrences] = useState<MonthlyTaskOccurrence[]>([]);
  const [weeklyTicks, setWeeklyTicks] = useState<Record<string, boolean>>({});
  const [weeklyPeriodKey, setWeeklyPeriodKey] = useState("");

  // งานประจำเดือน: คำนวณสถานะฝั่ง client เท่านั้น (กัน hydration mismatch จาก new Date())
  useEffect(() => {
    let alive = true;
    const now = new Date();
    const monthKey = bangkokMonthKey(now);
    fetchMonthlyEventPayload(monthKey)
      .then((payload) => alive && setMonthlyOccurrences(monthlyTaskOccurrences(monthKey, payload.states, undefined, now)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

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

  const { items, summary } = buildTodayWorkBoard({
    dailyPhases: (offDay ? [] : shiftPhases).map((phase) => {
      const record = records.find((item) => item.workDate === workDate && item.phaseId === phase.id);
      return {
        id: phase.id,
        title: phase.title,
        timeLabel: phase.timeLabel,
        visualStatus: workflowVisualStatus(records, workDate, phase.id),
        completed: record?.completed ?? 0,
        total: record?.total ?? phase.checklist.length
      };
    }),
    stockTasks: plannedStock.tasks.map((task) => {
      const submitted = Boolean(plannedStock.submitted[task.key]);
      return {
        key: task.key,
        label: task.label,
        href: task.href,
        statusText: plannedStatusText(task, submitted),
        overdueDays: task.overdueDays,
        upcoming: task.upcoming,
        submitted
      };
    }),
    weeklyEvents: weeklyEvents
      .filter((event) => isWeeklyEventActiveOn(event, workDate))
      .map((event) => {
        const ticked: Record<string, boolean> = {};
        if (weeklyPeriodKey) {
          for (const item of event.checklist) ticked[item.id] = Boolean(weeklyTicks[tickKey(weeklyPeriodKey, event.id, item.id)]);
        }
        return {
          id: event.id,
          name: event.name,
          game: event.game,
          href: weeklyEventHref(event.id),
          completed: weeklyEventCompleted(event, ticked),
          total: event.checklist.length
        };
      }),
    monthlyTasks: monthlyOccurrences.map((occurrence) => ({
      taskId: occurrence.taskId,
      name: occurrence.name,
      href: monthlyTasksSubmitHref(occurrence.taskId),
      status: occurrence.status,
      monthLabel: occurrence.monthLabel
    })),
    assignedRecords: assignedWorkRecords.map((record) => ({
      id: record.id,
      title: record.title,
      href: `/assigned-work/${encodeURIComponent(record.id)}`,
      employeeName: record.employeeName,
      note: record.note,
      status: effectiveAssignedWorkStatus(record),
      showStatus: canManageAssignedWork || isAssignedWorkPastDeadline(record.workDate)
    })),
    deliveryTasks: deliveryTasks
      .filter((task) => task.status !== "shipped")
      .map((task) => ({
        id: task.id,
        title: `ส่งของ #${task.orderCode}${task.customerName ? ` · ${task.customerName}` : ""}`,
        detail: task.itemsSummary || undefined,
        statusText: deliveryStatusText(task, workDate),
        state: deliveryTaskState(task, workDate)
      })),
    feedItems: assignedWorkFeed.map((item) => ({
      id: item.id,
      origin: item.origin,
      title: item.title,
      detail: item.detail,
      href: item.href,
      originLabel: item.originLabel,
      statusText: item.statusText,
      statusClass: item.statusClass
    }))
  });

  return (
    <article id="today-work" className="task-section today-work">
      <div className="task-section-head">
        <div>
          <p className="eyebrow">วันนี้</p>
          <h3>งานวันนี้ทั้งหมด</h3>
        </div>
        <span className={`status-pill ${summary.overdue > 0 ? "is-late" : ""}`}>
          {offDay && offLabel ? `${offLabel} · ` : ""}
          {todayWorkHeadline(summary)}
        </span>
      </div>
      <div className="daily-phase-grid">
        {items.length ? (
          items.map((item, index) => (
            <a key={item.id} href={item.href} className={`daily-phase-card ${item.statusClass}`}>
              <span>{item.state === "done" ? "✓" : String(index + 1).padStart(2, "0")}</span>
              <div>
                <small>{item.kindLabel}{item.detail ? ` · ${item.detail}` : ""}</small>
                <strong>{item.title}</strong>
                <em>{item.statusText}</em>
              </div>
            </a>
          ))
        ) : (
          <div className="daily-phase-card workflow-status-white">
            <span>00</span>
            <div>
              <small>{workDate}</small>
              <strong>วันนี้ยังไม่มีงานที่ต้องทำ</strong>
              <em>งานจะขึ้นที่นี่เมื่อถึงกำหนดตามตารางกะหรือมีคนมอบหมาย</em>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
