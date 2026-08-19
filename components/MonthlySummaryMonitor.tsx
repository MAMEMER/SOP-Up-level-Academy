"use client";

import { useMemo, useState } from "react";
import {
  elapsedSeconds,
  isWorkflowRecordOnTime,
  workflowVisualStatus
} from "../lib/workflow-records.ts";
import {
  filterReviewRecords,
  formatThaiDayLabel,
  groupRecordsByStaff,
  reviewableDates,
  reviewablePhaseTypes,
  summariseReviewRecords,
  type NamedWorkflowRecord
} from "../lib/monthly-summary-view.ts";

const monthlyLabel = {
  white: "ยังไม่เริ่ม",
  green: "ตรงเวลา",
  orange: "ช้า",
  red: "แดง",
  purple: "ต่อเนื่อง 3 วัน"
};

const ALL_DATES = "all";
const ALL_TYPES = "all";

// Records come from the page (every employee's, read on the server) and now carry who
// submitted them. The owner picks a day + a work type and sees each staff member's
// submissions grouped together — instead of one flat month-long list.
export function MonthlySummaryMonitor({
  records,
  monthKey,
  today
}: {
  records: NamedWorkflowRecord[];
  monthKey: string;
  today: string;
}) {
  const dates = useMemo(() => reviewableDates(records, monthKey), [records, monthKey]);
  const phaseTypes = useMemo(() => reviewablePhaseTypes(records, monthKey), [records, monthKey]);

  // Default to today when it has work to review, otherwise the most recent day with data —
  // so the owner lands on a focused day, not a wall of the whole month.
  const initialDate = dates.includes(today) ? today : dates[0] ?? ALL_DATES;
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [selectedPhase, setSelectedPhase] = useState<string>(ALL_TYPES);

  const datePrefix = selectedDate === ALL_DATES ? monthKey : selectedDate;
  const filtered = useMemo(
    () => filterReviewRecords(records, { datePrefix, phaseId: selectedPhase }),
    [records, datePrefix, selectedPhase]
  );
  const summary = useMemo(() => summariseReviewRecords(filtered), [filtered]);
  const staffGroups = useMemo(() => groupRecordsByStaff(filtered), [filtered]);

  const scopeLabel = selectedDate === ALL_DATES ? "ทั้งเดือน" : formatThaiDayLabel(selectedDate);

  return (
    <section className="workflow-panel">
      <div className="summary-filter performance-period-form">
        <label>
          วันที่
          <select value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)}>
            <option value={ALL_DATES}>ทั้งเดือน</option>
            {dates.map((date) => (
              <option key={date} value={date}>
                {formatThaiDayLabel(date)}
              </option>
            ))}
          </select>
        </label>
        <label>
          ประเภทงาน
          <select value={selectedPhase} onChange={(event) => setSelectedPhase(event.target.value)}>
            <option value={ALL_TYPES}>ทุกประเภท</option>
            {phaseTypes.map((phase) => (
              <option key={phase.phaseId} value={phase.phaseId}>
                {phase.phaseTitle}
              </option>
            ))}
          </select>
        </label>
        <p className="summary-filter-scope">
          กำลังดู: {scopeLabel}
          {selectedPhase !== ALL_TYPES
            ? ` · ${phaseTypes.find((phase) => phase.phaseId === selectedPhase)?.phaseTitle ?? ""}`
            : ""}
        </p>
      </div>

      <div className="monthly-metrics">
        <div className="board-stat">
          <span>Submitted</span>
          <strong>{summary.submittedRecords}</strong>
        </div>
        <div className="board-stat">
          <span>Complete</span>
          <strong>{summary.completedRecords}</strong>
        </div>
        <div className="board-stat">
          <span>Rate</span>
          <strong>{summary.completionRate}%</strong>
        </div>
        <div className="board-stat">
          <span>On Time</span>
          <strong>{summary.onTimeRecords}</strong>
        </div>
        <div className="board-stat">
          <span>Checklist</span>
          <strong>
            {summary.completedChecklist}/{summary.totalChecklist}
          </strong>
        </div>
      </div>

      {staffGroups.length ? (
        <div className="summary-staff-list">
          {staffGroups.map((group) => (
            <div key={group.employeeEmail} className="summary-staff-group">
              <div className="summary-staff-head">
                <strong>{group.employeeName}</strong>
                <span>
                  ส่ง {group.submitted} งาน
                  {group.missed ? ` · ค้าง ${group.missed}` : ""}
                </span>
              </div>
              <div className="review-table">
                {group.records.map((record) => {
                  const visualStatus = workflowVisualStatus(records, record.workDate, record.phaseId);
                  const isMissed = record.status === "missed";

                  return (
                    <div
                      key={`${record.workDate}:${record.phaseId}:${record.startedAt ?? ""}`}
                      className={`review-row workflow-status-${visualStatus}`}
                    >
                      <span className="phase-icon">
                        {isMissed ? "!" : isWorkflowRecordOnTime(record) ? "✓" : "!"}
                      </span>
                      <div>
                        <strong>{record.phaseTitle}</strong>
                        <small>
                          {formatThaiDayLabel(record.workDate)} · {record.completed}/{record.total} checklist
                        </small>
                        {!isMissed ? (
                          <small>
                            ใช้เวลา {Math.round(elapsedSeconds(record.startedAt, record.submittedAt) / 60)} นาที ·{" "}
                            {isWorkflowRecordOnTime(record) ? "ตรงเวลา" : "ช้ากว่ากำหนด"}
                          </small>
                        ) : (
                          <small>เลยกำหนดแล้วยังไม่ส่ง</small>
                        )}
                      </div>
                      <em>{monthlyLabel[visualStatus]}</em>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-review">
          <strong>ยังไม่มีข้อมูลส่งตรวจในช่วงที่เลือก</strong>
          <span>ลองเลือกวันอื่นหรือ “ทั้งเดือน” · ข้อมูลจะปรากฏเมื่อ staff กด “ส่งงาน” ในหน้า Checklist</span>
        </div>
      )}
    </section>
  );
}
