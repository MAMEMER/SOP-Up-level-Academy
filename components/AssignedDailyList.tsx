import { effectiveAssignedWorkStatus, isAssignedWorkPastDeadline } from "../lib/assigned-work-status.ts";
import type { AssignedWorkRecord } from "../lib/performance-service-records.ts";
import type { AssignedWorkFeedItem } from "../lib/assigned-work-feed.ts";

// "งานรายวัน" ของคนที่เข้าระบบอยู่ — งานที่เจ้าของมอบหมายให้วันนี้ + งานที่กะก่อนส่งต่อมา.
// หน้าแรกโชว์เฉพาะของคนคนนั้น งานของคนอื่นไปดูที่ /admin/ops แทน.

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
  workDate,
  canSeeStatus = false,
  emptyText = "วันนี้ยังไม่มีงานที่มอบหมายให้คุณ"
}: {
  records?: AssignedWorkRecord[];
  feed?: AssignedWorkFeedItem[];
  workDate: string;
  /** แอดมินเห็นสถานะได้ทันที · พนักงานเห็นหลังเลยกำหนดแล้วเท่านั้น */
  canSeeStatus?: boolean;
  emptyText?: string;
}) {
  if (records.length === 0 && feed.length === 0) {
    return <p className="assign-work__empty">{emptyText}</p>;
  }

  return (
    <div className="daily-phase-grid">
      {records.map((record, index) => {
        const status = effectiveAssignedWorkStatus(record);
        const showStatus = canSeeStatus || isAssignedWorkPastDeadline(record.workDate);
        return (
          <a
            key={record.id}
            href={`/assigned-work/${encodeURIComponent(record.id)}`}
            className={`daily-phase-card ${showStatus ? assignedStatusClass[status] : "workflow-status-white"}`}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
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
          <span>{String(records.length + index + 1).padStart(2, "0")}</span>
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
