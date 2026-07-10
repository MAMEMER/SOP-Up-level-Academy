"use client";

import { useEffect, useState } from "react";
import {
  elapsedSeconds,
  isWorkflowRecordOnTime,
  readWorkflowRecordsFromStorage,
  summarizeMonthlyRecords,
  workflowVisualStatus,
  type WorkflowDailyRecord
} from "../lib/workflow-records.ts";

const monthlyLabel = {
  white: "ยังไม่เริ่ม",
  green: "ตรงเวลา",
  orange: "ช้า",
  red: "แดง",
  purple: "ต่อเนื่อง 3 วัน"
};

export function MonthlySummaryMonitor() {
  const [records, setRecords] = useState<WorkflowDailyRecord[]>([]);
  const monthKey = new Date().toISOString().slice(0, 7);

  useEffect(() => {
    setRecords(readWorkflowRecordsFromStorage(window.localStorage));
  }, []);

  const summary = summarizeMonthlyRecords(records, monthKey);
  const reviewRecords = records.filter(
    (record) => record.workDate.startsWith(monthKey) && (record.status === "submitted" || record.status === "missed")
  );

  return (
    <section className="workflow-panel">
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
          <strong>{summary.completedChecklist}/{summary.totalChecklist}</strong>
        </div>
      </div>

      <div className="review-table">
        {reviewRecords.length ? (
          reviewRecords.map((record) => {
            const visualStatus = workflowVisualStatus(records, record.workDate, record.phaseId);
            const isMissed = record.status === "missed";

            return (
            <div key={`${record.workDate}:${record.phaseId}`} className={`review-row workflow-status-${visualStatus}`}>
              <span className="phase-icon">{isMissed ? "!" : isWorkflowRecordOnTime(record) ? "✓" : "!"}</span>
              <div>
                <strong>{record.phaseTitle}</strong>
                <small>{record.workDate} · {record.completed}/{record.total} checklist</small>
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
          })
        ) : (
          <div className="empty-review">
            <strong>ยังไม่มีข้อมูลส่งตรวจในเดือนนี้</strong>
            <span>ข้อมูลจะปรากฏเมื่อ staff กด “ส่งงาน” ในหน้า Checklist</span>
          </div>
        )}
      </div>
    </section>
  );
}
