"use client";

import { useEffect, useState } from "react";
import {
  elapsedSeconds,
  formatWorkDate,
  isWorkflowRecordOnTime,
  workflowVisualStatus
} from "../lib/workflow-records.ts";
import { useWorkflowRecordsForDay } from "../lib/workflow-records-client.ts";
import { fetchSubmitLog, summarisePresses, type SubmitLogEntry } from "../lib/submit-log-client.ts";

const pressTime = (iso: string) =>
  new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date(iso)
  );

const reviewLabel = {
  white: "ยังไม่เริ่ม",
  green: "ตรงเวลา",
  orange: "ช้า",
  red: "แดง",
  purple: "ต่อเนื่อง 3 วัน"
};

// Manager review reads EVERY employee's day record, not the reviewer's own — the whole
// point of the page is seeing what staff submitted.
export function WorkflowReviewRecords() {
  const [workDate, setWorkDate] = useState(formatWorkDate());
  const { staff, loaded } = useWorkflowRecordsForDay(workDate);
  // ประวัติการกดปุ่มส่งงาน — ตอบคำถาม "น้องกดมาจริงไหม กี่ครั้ง กี่โมง"
  const [presses, setPresses] = useState<SubmitLogEntry[]>([]);

  useEffect(() => {
    let alive = true;
    fetchSubmitLog(workDate)
      .then((entries) => alive && setPresses(entries))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [workDate]);

  const rows = staff
    .map((person) => ({
      ...person,
      records: person.records.filter(
        (record) => record.workDate === workDate && (record.status === "submitted" || record.status === "missed")
      )
    }))
    .filter((person) => person.records.length > 0);

  // กดส่งแล้วแต่ไม่มีข้อมูลในระบบ = ระบบพลาด ไม่ใช่พนักงานไม่ทำ. ถ้าไม่แสดงตรงนี้ เคสนี้จะ
  // มองไม่เห็นเลย เพราะไม่มีแถวงานให้แสดง
  const orphanedPresses = presses.filter(
    (entry) =>
      !entry.impersonating &&
      !staff.some(
        (person) =>
          person.employeeEmail === entry.employeeEmail &&
          person.records.some((record) => record.workDate === workDate && record.phaseId === entry.phaseId)
      )
  );

  return (
    <section className="workflow-panel">
      <div className="section-heading">
        <p className="eyebrow">submitted</p>
        <h2>ข้อมูลที่พนักงานส่งให้ตรวจ</h2>
        <p>รายการนี้มาจากปุ่มส่งงานในหน้า Checklist ของพนักงานทุกคน</p>
      </div>
      <label className="workflow-note-field compact">
        <span>วันที่ตรวจ</span>
        <input type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} />
      </label>
      <div className="review-table">
        {!loaded ? (
          <div className="empty-review">
            <strong>กำลังโหลดข้อมูล…</strong>
          </div>
        ) : rows.length ? (
          rows.flatMap((person) =>
            person.records.map((record) => {
              const visualStatus = workflowVisualStatus(person.records, workDate, record.phaseId);
              const isMissed = record.status === "missed";

              return (
                <div
                  key={`${person.employeeEmail}:${record.workDate}:${record.phaseId}`}
                  className={`review-row workflow-status-${visualStatus}`}
                >
                  <span className="phase-icon">{isMissed ? "!" : isWorkflowRecordOnTime(record) ? "✓" : "!"}</span>
                  <div>
                    <strong>{person.employeeName} · {record.phaseTitle}</strong>
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
                    {(() => {
                      const pressLabel = summarisePresses(
                        presses.filter(
                          (entry) => entry.employeeEmail === person.employeeEmail && entry.phaseId === record.phaseId
                        ),
                        pressTime
                      );
                      return pressLabel ? <small className="review-presses">{pressLabel}</small> : null;
                    })()}
                  </div>
                  <em>{reviewLabel[visualStatus]}</em>
                </div>
              );
            })
          )
        ) : (
          <div className="empty-review">
            <strong>ยังไม่มีข้อมูลที่ส่งตรวจของวันนี้</strong>
            <span>ให้พนักงานกด “ส่งงาน” ในหน้า Checklist หลังบันทึกงานแต่ละช่วง</span>
          </div>
        )}
      </div>

      {orphanedPresses.length ? (
        <div className="review-orphaned">
          <strong>กดส่งงานแล้วแต่ไม่มีข้อมูลในระบบ</strong>
          <p>รอบเหล่านี้พนักงานกดจริง แต่บันทึกไม่ถึงเซิร์ฟเวอร์ — ให้ตรวจก่อนตัดสินว่าไม่ได้ทำ</p>
          <ul>
            {orphanedPresses.map((entry) => (
              <li key={entry.id}>
                {entry.employeeName} · {entry.phaseTitle || entry.phaseId} · กดเมื่อ {pressTime(entry.pressedAt)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
