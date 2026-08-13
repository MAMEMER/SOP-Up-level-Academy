"use client";

import {
  PACE_CLASS,
  PACE_LABEL,
  currentPercent,
  dailyTargetPercent,
  dayIndex,
  daysLeft,
  expectedPercent,
  paceOf,
  totalDays,
  type WorkProject
} from "../lib/work-projects.ts";

// แถบความคืบหน้าของโปรเจกต์ + ตัวเลขที่ต้องรู้ใน 1 บรรทัด: ตอนนี้กี่ % · ควรถึงกี่ % ·
// วันที่เท่าไหร่ของกี่วัน · เหลือกี่วัน · ต้องทำวันละกี่ % ถึงจะทัน.
// เส้นบางบนแถบ = เป้าหมายตามแผนวันนี้ เห็นปุ๊บรู้เลยว่าตามทันหรือช้ากว่าแผน.
export function ProjectMeter({ project, today }: { project: WorkProject; today: string }) {
  const percent = currentPercent(project);
  const expected = expectedPercent(project, today);
  const pace = paceOf(project, today);
  const total = totalDays(project.startDate, project.endDate);
  const left = daysLeft(project, today);
  const perDay = dailyTargetPercent(project, today);

  return (
    <div className="project-meter">
      <div className="project-meter__head">
        <strong>{percent}%</strong>
        <span className={`status-pill ${PACE_CLASS[pace]}`}>{PACE_LABEL[pace]}</span>
      </div>
      <div className="project-meter__bar" role="img" aria-label={`ทำไปแล้ว ${percent}% จากเป้าหมายวันนี้ ${expected}%`}>
        <span className="project-meter__fill" style={{ width: `${percent}%` }} />
        <span className="project-meter__target" style={{ left: `${expected}%` }} />
      </div>
      <p className="project-meter__stats">
        ตามแผนวันนี้ควรได้ {expected}% · วันที่ {dayIndex(project, today)} จาก {total} วัน · เหลือ {left} วัน
        {project.status === "active" && percent < 100 ? ` · ต้องทำวันละ ${perDay}% ถึงจะทัน` : ""}
      </p>
    </div>
  );
}
