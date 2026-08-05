import Link from "next/link";
import type { OpsSummary } from "../lib/ops-summary.ts";
import { workflowVisualStatus } from "../lib/workflow-records.ts";
import { OpsAssignmentsPanel } from "./OpsAssignmentsPanel.tsx";

const severityLabel: Record<string, string> = {
  fixed_immediately: "แก้ได้ทันที",
  repeated: "ซ้ำเรื่องเดิม",
  severe: "รุนแรง"
};

const phaseStatusLabel: Record<string, string> = {
  white: "ยังไม่เริ่ม",
  green: "ตรงเวลา",
  orange: "ช้า",
  red: "เกินกำหนด",
  purple: "ต่อเนื่อง 3 วัน"
};

function percent(done: number, total: number) {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

export function OwnerOpsBoard({ summary, isOwner }: { summary: OpsSummary; isOwner: boolean }) {
  const { daily, weekly, monthly } = summary;
  const openAssignments = summary.assignments.filter((item) => item.status === "open");
  const needsReview = summary.assignments.filter((item) => item.status === "submitted");

  if (!summary.storageReady) {
    return (
      <p className="input-status warning">
        ยังต่อฐานข้อมูลไม่ได้ — หน้านี้แสดงข้อมูลจริงเท่านั้น จึงยังไม่มีอะไรให้แสดง
      </p>
    );
  }

  return (
    <div className="owner-ops">
      <section className="owner-ops__metrics">
        <div className="board-stat">
          <span>Checklist วันนี้</span>
          <strong>{percent(daily.completed, daily.total)}%</strong>
          <small>{daily.completed}/{daily.total} ข้อ</small>
        </div>
        <div className="board-stat">
          <span>ส่งตรวจแล้ว</span>
          <strong>{daily.submittedPhases}</strong>
          <small>จาก {daily.phaseCount} ช่วง × {summary.staff.length || 0} คน</small>
        </div>
        <div className="board-stat">
          <span>เกินกำหนด</span>
          <strong className={daily.latePhases ? "is-alert" : undefined}>{daily.latePhases}</strong>
          <small>ช่วงงานที่เลยเวลา</small>
        </div>
        <div className="board-stat">
          <span>งานมอบหมายค้าง</span>
          <strong className={openAssignments.length ? "is-alert" : undefined}>{openAssignments.length}</strong>
          <small>รอตรวจ {needsReview.length}</small>
        </div>
        <div className="board-stat">
          <span>งานส่งต่อค้าง</span>
          <strong className={summary.handoffs.length ? "is-alert" : undefined}>{summary.handoffs.length}</strong>
          <small>ข้ามกะ</small>
        </div>
        <div className="board-stat">
          <span>ปัญหาบริการวันนี้</span>
          <strong className={summary.serviceIssues.length ? "is-alert" : undefined}>{summary.serviceIssues.length}</strong>
          <small>จากที่แอดมินบันทึก</small>
        </div>
      </section>

      <section className="owner-ops__panel">
        <div className="section-heading">
          <p className="eyebrow">staff today</p>
          <h3>ใครทำอะไรไปแล้ววันนี้</h3>
          <p>มาจาก checklist ที่พนักงานติ๊กจริงในวันที่เลือก</p>
        </div>

        {summary.staff.length ? (
          <div className="owner-ops__staff">
            {summary.staff.map((person) => (
              <article key={person.employeeEmail}>
                <div className="owner-ops__staff-head">
                  <strong>{person.employeeName}</strong>
                  {person.scheduledShiftLabel ? (
                    <span className="owner-ops__shift-tag">{person.scheduledShiftLabel}</span>
                  ) : null}
                  <span>{percent(person.completed, person.total)}% · {person.completed}/{person.total} ข้อ</span>
                </div>
                <div className="owner-ops__phases">
                  {person.records.map((record) => {
                    const visual = workflowVisualStatus(person.records, summary.workDate, record.phaseId);
                    const offShift = person.offShiftPhaseIds.includes(record.phaseId);
                    return (
                      <span
                        key={record.phaseId}
                        className={`owner-ops__phase workflow-status-${visual}${offShift ? " is-off-shift" : ""}`}
                        title={offShift ? `${record.phaseTitle} ไม่อยู่ในกะที่ลงตาราง (${person.scheduledShiftLabel})` : undefined}
                      >
                        {record.phaseTitle} · {record.completed}/{record.total} · {phaseStatusLabel[visual] || visual}
                        {offShift ? " · ⚠ นอกกะ" : ""}
                      </span>
                    );
                  })}
                </div>
                {person.offShiftPhaseIds.length ? (
                  <p className="owner-ops__note owner-ops__note--warn">
                    ⚠ มีงานที่ติ๊กนอกกะที่ลงตาราง ({person.scheduledShiftLabel}) — ตรวจสอบว่าลงกะถูกหรือติ๊ก checklist ผิดกะ
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="owner-ops__empty">ยังไม่มีใครติ๊ก checklist ในวันนี้</p>
        )}

        {summary.noRecordStaff.length ? (
          <p className="owner-ops__note">ยังไม่เริ่มเลย: {summary.noRecordStaff.join(" · ")}</p>
        ) : null}

        <Link href="/manager-review" className="owner-ops__link">ดูรายละเอียดที่ตรวจงาน →</Link>
      </section>

      <div className="owner-ops__row">
        <OpsAssignmentsPanel workDate={summary.workDate} initialGroups={summary.assignmentGroups} />

        <section className="owner-ops__panel">
          <div className="section-heading">
            <p className="eyebrow">handoff</p>
            <h3>งานส่งต่อค้าง ({summary.handoffs.length})</h3>
          </div>
          {summary.handoffs.length ? (
            <ul className="owner-ops__list">
              {summary.handoffs.map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  <small>{item.fromStaff} → {item.toStaff === "any" ? "กะถัดไป" : item.toStaff} · {item.workDate}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="owner-ops__empty">ไม่มีงานส่งต่อค้าง</p>
          )}
          <Link href="/handoff" className="owner-ops__link">ดูงานส่งต่อ →</Link>
        </section>
      </div>

      <div className="owner-ops__row">
        <section className="owner-ops__panel">
          <div className="section-heading">
            <p className="eyebrow">weekly</p>
            <h3>งานประจำสัปดาห์ · {weekly.periodKey}</h3>
          </div>

          <p className="owner-ops__subhead">Weekly task · Stock / Sleeve</p>
          <ul className="owner-ops__list">
            <li>
              <strong>Stock อุปกรณ์ / Sleeve</strong>
              <small>ติ๊กแล้ว {weekly.stockTicks} ข้อ</small>
            </li>
          </ul>

          <p className="owner-ops__subhead">Weekly event · งานวันกิจกรรม ({weekly.eventDate})</p>
          {weekly.events.length ? (
            <ul className="owner-ops__list">
              {weekly.events.map((event) => {
                const done = event.total > 0 && event.completed >= event.total;
                const status = event.submitted ? "ส่งงานแล้ว" : done ? "ครบแล้ว (ยังไม่ส่ง)" : "กำลังทำ";
                return (
                  <li key={event.id}>
                    <strong>{event.name}</strong>
                    <small>{status} · ทำ {event.completed}/{event.total} ข้อ</small>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="owner-ops__empty">วันนี้ไม่มีกิจกรรม</p>
          )}

          <Link href="/checklist-weekly" className="owner-ops__link">เปิด checklist สัปดาห์ →</Link>
        </section>

        <section className="owner-ops__panel">
          <div className="section-heading">
            <p className="eyebrow">monthly</p>
            <h3>งานประจำเดือน · {monthly.monthKey}</h3>
          </div>
          <ul className="owner-ops__list">
            <li>
              <strong>เสร็จสิ้น {monthly.done}/{monthly.total}</strong>
              <small>กำลังทำ / ส่งตรวจ {monthly.inProgress}</small>
            </li>
          </ul>
          <Link href="/monthly-tasks" className="owner-ops__link">เปิดงานประจำเดือน →</Link>
        </section>
      </div>

      <section className="owner-ops__panel">
        <div className="section-heading">
          <p className="eyebrow">issues</p>
          <h3>ปัญหาบริการที่บันทึกไว้วันนี้</h3>
        </div>
        {summary.serviceIssues.length ? (
          <ul className="owner-ops__list">
            {summary.serviceIssues.map((issue) => (
              <li key={issue.id}>
                <strong>{issue.employeeName} · {severityLabel[issue.severity] || issue.severity} × {issue.count}</strong>
                <small>{issue.note || "ไม่มีหมายเหตุ"}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="owner-ops__empty">ยังไม่มีปัญหาบริการที่บันทึกวันนี้</p>
        )}
        <Link href="/admin/performance-score" className="owner-ops__link">
          {isOwner ? "ดูคะแนน + การหักเงิน →" : "ดูคะแนนพนักงาน →"}
        </Link>
      </section>
    </div>
  );
}
