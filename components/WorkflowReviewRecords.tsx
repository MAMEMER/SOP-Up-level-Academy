"use client";

import { useEffect, useState } from "react";
import {
  elapsedSeconds,
  formatWorkDate,
  isWorkflowRecordOnTime,
  readWorkflowRecordsFromStorage,
  workflowVisualStatus,
  type WorkflowDailyRecord
} from "../lib/workflow-records.ts";

const reviewLabel = {
  white: "ยังไม่เริ่ม",
  green: "ตรงเวลา",
  orange: "ช้า",
  red: "แดง",
  purple: "ต่อเนื่อง 3 วัน"
};

export function WorkflowReviewRecords() {
  const [records, setRecords] = useState<WorkflowDailyRecord[]>([]);
  const workDate = formatWorkDate();

  useEffect(() => {
    setRecords(readWorkflowRecordsFromStorage(window.localStorage));
  }, []);

  const todayRecords = records.filter((record) => record.workDate === workDate);
  const reviewRecords = todayRecords.filter((record) => record.status === "submitted" || record.status === "missed");

  return (
    <section className="workflow-panel">
      <div className="section-heading">
        <p className="eyebrow">submitted today</p>
        <h2>ข้อมูลที่พนักงานส่งให้ตรวจ</h2>
        <p>รายการนี้มาจากปุ่มส่งงานในหน้า Checklist ของวันปัจจุบัน</p>
      </div>
      <div className="review-table">
        {reviewRecords.length ? (
          reviewRecords.map((record) => {
            const visualStatus = workflowVisualStatus(records, workDate, record.phaseId);
            const isMissed = record.status === "missed";

            return (
            <div key={`${record.workDate}:${record.phaseId}`} className={`review-row workflow-status-${visualStatus}`}>
              <span className="phase-icon">{isMissed ? "!" : isWorkflowRecordOnTime(record) ? "✓" : "!"}</span>
              <div>
                <strong>{record.phaseTitle}</strong>
                <small>
                  {record.workDate} · เสร็จ {record.completed}/{record.total} ·{" "}
                  {isMissed ? "เลยกำหนดแล้วยังไม่ส่ง" : "ส่งเมื่อ"}{" "}
                  {!isMissed && record.submittedAt ? new Date(record.submittedAt).toLocaleTimeString("th-TH") : ""}
                </small>
                {!isMissed ? (
                  <small>
                    ใช้เวลา {Math.round(elapsedSeconds(record.startedAt, record.submittedAt) / 60)} นาที ·{" "}
                    {isWorkflowRecordOnTime(record) ? "ตรงเวลา" : "ช้ากว่ากำหนด"}
                  </small>
                ) : null}
              </div>
              <em>{reviewLabel[visualStatus]}</em>
            </div>
            );
          })
        ) : (
          <div className="empty-review">
            <strong>ยังไม่มีข้อมูลที่ส่งตรวจวันนี้</strong>
            <span>ให้พนักงานกด “ส่งงาน” ในหน้า Checklist หลังบันทึกงานแต่ละช่วง</span>
          </div>
        )}
      </div>
    </section>
  );
}
