"use client";

import { useEffect, useState } from "react";
import { effectiveAssignedWorkStatus, isAssignedWorkPastDeadline } from "../lib/assigned-work-status.ts";
import type { AssignedWorkRecord } from "../lib/performance-service-records.ts";
import type { AssignedWorkFeedItem } from "../lib/assigned-work-feed.ts";
import {
  weeklyEventById,
  weeklyEventCompleted,
  weeklyEventHref,
  type WeeklyEvent
} from "../lib/weekly-event-tasks.ts";
import { fetchWeeklyEventPayload, tickKey, weeklyEventPeriodKey } from "../lib/weekly-event-store.ts";

// "งานรายวัน" ของคนที่เข้าระบบอยู่ — งานที่เจ้าของมอบหมายให้วันนี้ + งานที่กะก่อนส่งต่อมา.
// หน้าแรกโชว์เฉพาะของคนคนนั้น งานของคนอื่นไปดูที่ /admin/ops แทน.
//
// งานกิจกรรมประจำสัปดาห์ (Lorcana, Pokemon, Rift Bound ฯลฯ) ที่ "ถึงกำหนดวันนี้" ถือเป็น
// งานของทีมบางแค → ขึ้นเป็นการ์ดแรกสุดในหัวข้อ "งานที่มอบหมาย" ของวันนั้น กดแล้วไป checklist
// ของเกมนั้นโดยตรง. เชื่อมกับปฏิทินกิจกรรม (/admin/calendar) ผ่าน activeDays ชุดเดียวกัน.

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

export function AssignedDailyList({
  records = [],
  feed = [],
  weeklyEventIds = [],
  workDate,
  canSeeStatus = false,
  emptyText = "วันนี้ยังไม่มีงานที่มอบหมายให้คุณ"
}: {
  records?: AssignedWorkRecord[];
  feed?: AssignedWorkFeedItem[];
  /** งานกิจกรรมประจำสัปดาห์ที่ถึงกำหนดวันนี้ (id ของ weeklyEvents) — โชว์เป็นการ์ดแรกสุด */
  weeklyEventIds?: string[];
  workDate: string;
  /** แอดมินเห็นสถานะได้ทันที · พนักงานเห็นหลังเลยกำหนดแล้วเท่านั้น */
  canSeeStatus?: boolean;
  emptyText?: string;
}) {
  const activeEvents = weeklyEventIds
    .map((id) => weeklyEventById(id))
    .filter((event): event is WeeklyEvent => Boolean(event));

  // ความคืบหน้า checklist ของงานกิจกรรม (ติ๊กกี่ข้อ) — อ่านจาก server record ของวันนี้
  const [weeklyTicks, setWeeklyTicks] = useState<Record<string, boolean>>({});
  const [weeklyPeriodKey, setWeeklyPeriodKey] = useState<string>("");

  useEffect(() => {
    if (activeEvents.length === 0) return;
    let alive = true;
    const key = weeklyEventPeriodKey(workDate);
    setWeeklyPeriodKey(key);
    fetchWeeklyEventPayload(key)
      .then((payload) => alive && setWeeklyTicks(payload.ticks))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workDate, weeklyEventIds.join(",")]);

  function eventTickedMap(event: WeeklyEvent): Record<string, boolean> {
    const map: Record<string, boolean> = {};
    if (!weeklyPeriodKey) return map;
    for (const item of event.checklist) map[item.id] = Boolean(weeklyTicks[tickKey(weeklyPeriodKey, event.id, item.id)]);
    return map;
  }

  if (records.length === 0 && feed.length === 0 && activeEvents.length === 0) {
    return <p className="assign-work__empty">{emptyText}</p>;
  }

  return (
    <div className="daily-phase-grid">
      {/* งานกิจกรรมของทีมบางแคที่ถึงกำหนดวันนี้ — เรียงลำดับแรกเสมอ */}
      {activeEvents.map((event, index) => {
        const total = event.checklist.length;
        const completed = weeklyEventCompleted(event, eventTickedMap(event));
        const done = completed === total && completed > 0;
        return (
          <a
            key={`weekly-${event.id}`}
            href={weeklyEventHref(event.id)}
            className={`daily-phase-card ${done ? "workflow-status-green" : "workflow-status-white"}`}
          >
            <span>{done ? "✓" : String(index + 1).padStart(2, "0")}</span>
            <div>
              <small>งานกิจกรรม · {event.game} · {workDate}</small>
              <strong>{event.name}</strong>
              <em>ถึงกำหนดวันนี้ · ทีมบางแค · เปิด checklist · {completed}/{total}</em>
            </div>
          </a>
        );
      })}
      {records.map((record, index) => {
        const status = effectiveAssignedWorkStatus(record);
        const showStatus = canSeeStatus || isAssignedWorkPastDeadline(record.workDate);
        return (
          <a
            key={record.id}
            href={`/assigned-work/${encodeURIComponent(record.id)}`}
            className={`daily-phase-card ${showStatus ? assignedStatusClass[status] : "workflow-status-white"}`}
          >
            <span>{String(activeEvents.length + index + 1).padStart(2, "0")}</span>
            <div>
              <small>{record.employeeName} · {record.workDate}</small>
              <strong>{record.title}</strong>
              <em>{showStatus ? assignedStatusText[status] : "รอส่งงาน"}{record.note ? ` · ${record.note}` : ""}</em>
              {record.trackingNumber ? <em>Tracking: {record.trackingNumber}</em> : null}
            </div>
          </a>
        );
      })}
      {feed.map((item, index) => (
        <a key={item.id} href={item.href} className={`daily-phase-card ${item.statusClass}`}>
          <span>{String(activeEvents.length + records.length + index + 1).padStart(2, "0")}</span>
          <div>
            <small>{item.assigneeLabel} · {item.workDate || workDate}</small>
            <strong>{item.title}</strong>
            <em>{item.originLabel} · {item.statusText}</em>
            {item.detail ? <em>{item.detail}</em> : null}
          </div>
        </a>
      ))}
    </div>
  );
}
