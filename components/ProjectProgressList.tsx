"use client";

import { displayNameFor } from "../lib/employee-directory.ts";
import { projectDays, type WorkProject } from "../lib/work-projects.ts";

// ไทม์ไลน์รายวันของโปรเจกต์ — วันไหนใครทำอะไร ถึงกี่ % และวันไหนเงียบ (ไม่มีใครอัปเดต).
// ทั้งเจ้าของและคนทำเห็นก้อนเดียวกัน จะได้คุยกันจากข้อมูลชุดเดียว.
export function ProjectProgressList({
  project,
  today,
  onDelete
}: {
  project: WorkProject;
  today: string;
  /** ลบ progress ที่ลงผิด — คนลงเองหรือแอดมินเท่านั้นที่ได้รับ prop นี้ */
  onDelete?: (progressId: string) => void;
}) {
  const days = projectDays(project, today).filter((day) => !day.isFuture);
  if (days.length === 0) return <p className="project-days__empty">ยังไม่ถึงวันเริ่มงาน</p>;

  return (
    <ol className="project-days">
      {[...days].reverse().map((day) => (
        <li
          key={day.date}
          className={`project-days__day${day.missed ? " is-missed" : ""}${day.isToday ? " is-today" : ""}`}
        >
          <div className="project-days__head">
            <strong>
              วันที่ {day.index} · {day.date}
              {day.isToday ? " (วันนี้)" : ""}
            </strong>
            <span>{day.entries.length ? `${day.percent}%` : day.missed ? "ไม่ได้อัปเดต" : "-"}</span>
          </div>
          {day.entries.map((entry) => (
            <div key={entry.id} className="project-days__entry">
              <p>
                <strong>{displayNameFor(entry.by)}</strong> · {entry.percent}% · {entry.at.slice(11, 16)} น.
              </p>
              <p>{entry.note}</p>
              {entry.images?.length ? (
                <p className="project-days__files">
                  {entry.images.map((url, index) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      รูป{index + 1}
                    </a>
                  ))}
                </p>
              ) : null}
              {entry.link ? (
                <p className="project-days__files">
                  <a href={entry.link} target="_blank" rel="noreferrer">
                    ลิงก์งาน
                  </a>
                </p>
              ) : null}
              {onDelete ? (
                <button type="button" className="assign-work__del" onClick={() => onDelete(entry.id)}>
                  ลบรายการนี้
                </button>
              ) : null}
            </div>
          ))}
        </li>
      ))}
    </ol>
  );
}
