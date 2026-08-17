"use client";

import { useCallback, useEffect, useState } from "react";
import { ProjectMeter } from "./ProjectMeter.tsx";
import { ProjectProgressList } from "./ProjectProgressList.tsx";
import { ProjectReviewPanel } from "./ProjectReviewPanel.tsx";
import { ProjectAssignForm, type StaffOption } from "./ProjectAssignForm.tsx";
import { ASSIGNEE_STATUS_CLASS, ASSIGNEE_STATUS_LABEL, assigneeStatus } from "../lib/project-review.ts";
import { displayNameFor } from "../lib/employee-directory.ts";
import { type TeamOption } from "../lib/team-options.ts";
import {
  deleteProject,
  deleteProjectProgress,
  fetchProjectsForBranch,
  setProjectMode,
  setProjectStatus,
  updateProjectAssignees,
  updateProjectDates
} from "../lib/work-projects-store.ts";
import {
  MODE_LABEL,
  PROJECT_STATUS_LABEL,
  addDays,
  isSingleDay,
  projectMode,
  progressAuthorsOn,
  progressCount,
  sortProjects,
  teamNeedsProgressToday,
  totalDays,
  type WorkProject
} from "../lib/work-projects.ts";

// หน้าเจ้าของสำหรับงานแบบโปรเจกต์: สั่งงานเป็นช่วงเวลา (ตั้งแต่วันไหนถึงวันไหน รวมกี่วัน ใครทำบ้าง)
// แล้วตามความคืบหน้าเป็นรายวัน. ยืด/ลดเวลา และเพิ่มคนช่วยได้ตลอดโดยไม่ต้องสร้างงานใหม่.
export function ProjectBoard({
  branch,
  staff,
  teams = [],
  today
}: {
  branch: string;
  staff: StaffOption[];
  teams?: TeamOption[];
  today: string;
}) {
  const [rows, setRows] = useState<WorkProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(sortProjects(await fetchProjectsForBranch(branch)));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [branch]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="assign-work">
      <ProjectAssignForm
        branch={branch}
        staff={staff}
        teams={teams}
        defaultStartDate={today}
        defaultEndDate={addDays(today, 6)}
        onCreated={load}
      />

      <section className="assign-work__list">
        <p className="assign-work__label">งานที่มอบหมายทั้งหมด</p>
        {loading ? (
          <p className="assign-work__empty">กำลังโหลด…</p>
        ) : rows.length === 0 ? (
          <p className="assign-work__empty">ยังไม่มีงานที่มอบหมาย</p>
        ) : (
          <div className="project-list">
            {rows.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                today={today}
                staff={staff}
                open={openId === project.id}
                onToggleOpen={() => setOpenId(openId === project.id ? null : project.id)}
                onChanged={load}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ProjectRow({
  project,
  today,
  staff,
  open,
  onToggleOpen,
  onChanged
}: {
  project: WorkProject;
  today: string;
  staff: StaffOption[];
  open: boolean;
  onToggleOpen: () => void;
  onChanged: () => Promise<void>;
}) {
  const [startDate, setStartDate] = useState(project.startDate);
  const [endDate, setEndDate] = useState(project.endDate);
  const [assignees, setAssignees] = useState<string[]>(project.assignees);
  const [busy, setBusy] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsToday = teamNeedsProgressToday(project, today);
  const todayCount = progressCount(project, today);
  const totalCount = progressCount(project);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function toggleAssignee(code: string) {
    setAssignees((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  const datesChanged = startDate !== project.startDate || endDate !== project.endDate;
  const assigneesChanged =
    assignees.length !== project.assignees.length || assignees.some((code) => !project.assignees.includes(code));

  return (
    <section className="project-card soft-card">
      <div className="project-card__head">
        <div>
          <strong>{project.title}</strong>
          <em>
            {project.startDate} → {project.endDate} · รวม {totalDays(project.startDate, project.endDate)} วัน ·{" "}
            {project.assignees.map(displayNameFor).join(", ")}
          </em>
        </div>
        <span className="project-card__status">
          {MODE_LABEL[projectMode(project)]}
          {isSingleDay(project) ? " · วันเดียว" : ""} · {PROJECT_STATUS_LABEL[project.status]}
        </span>
      </div>

      {project.detail ? <p className="project-card__detail">{project.detail}</p> : null}
      {project.expectedResult ? <p className="project-card__detail">งานเสร็จคือ: {project.expectedResult}</p> : null}

      <ProjectMeter project={project} today={today} />

      {/* สถานะคะแนนรายคน — เห็นได้ทันทีว่าใครผ่าน/ต้องแก้/ล่าช้า */}
      <div className="project-card__statuses">
        {project.assignees.map((code) => {
          const status = assigneeStatus(project, code);
          return (
            <span key={code} className={`project-card__pstat ${ASSIGNEE_STATUS_CLASS[status]}`}>
              {displayNameFor(code)}: {ASSIGNEE_STATUS_LABEL[status]}
            </span>
          );
        })}
      </div>

      {/* เป้าคือวันละอย่างน้อย 1 ครั้งจากใครก็ได้ในทีม — ไม่ใช่ทุกคนต้องลงของตัวเอง */}
      {needsToday ? (
        <p className="project-card__nudge">
          วันนี้ยังไม่มีใครส่ง progress — ผู้รับผิดชอบ: {project.assignees.map(displayNameFor).join(", ")}
        </p>
      ) : project.status === "active" ? (
        <p className="project-card__done-today">
          วันนี้ส่งแล้ว {todayCount} ครั้ง · โดย {progressAuthorsOn(project, today).map(displayNameFor).join(", ")}
        </p>
      ) : null}
      <p className="project-card__count">อัปเดตทั้งหมด {totalCount} ครั้ง</p>

      <div className="project-card__controls">
        <div className="assign-work__due-row">
          <label>
            ตั้งแต่วันที่
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label>
            ถึงวันที่
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          <span className="project-form__days">รวม {totalDays(startDate, endDate)} วัน</span>
        </div>
        <div className="project-card__quick">
          <span>ปรับเวลาเร็วๆ</span>
          <button type="button" onClick={() => setEndDate(addDays(endDate, -1))}>− 1 วัน</button>
          <button type="button" onClick={() => setEndDate(addDays(endDate, 1))}>+ 1 วัน</button>
          <button type="button" onClick={() => setEndDate(addDays(endDate, 7))}>+ 7 วัน</button>
          {datesChanged ? (
            <button
              type="button"
              className="primary-action"
              disabled={busy}
              onClick={() => run(() => updateProjectDates(project.id, startDate, endDate))}
            >
              บันทึกช่วงเวลาใหม่
            </button>
          ) : null}
        </div>

        <div className="assign-work__chips">
          {staff.map((person) => (
            <label key={person.code} className={assignees.includes(person.code) ? "assign-work__chip is-on" : "assign-work__chip"}>
              <input type="checkbox" checked={assignees.includes(person.code)} onChange={() => toggleAssignee(person.code)} />
              {person.displayName}
            </label>
          ))}
        </div>
        {assigneesChanged ? (
          <button
            type="button"
            className="primary-action"
            disabled={busy || assignees.length === 0}
            onClick={() => run(() => updateProjectAssignees(project.id, assignees))}
          >
            บันทึกคนที่รับผิดชอบ
          </button>
        ) : null}

        <div className="assign-work__chips">
          {(["single", "group"] as const).map((value) => (
            <button
              type="button"
              key={value}
              className={projectMode(project) === value ? "assign-work__chip is-on" : "assign-work__chip"}
              disabled={busy}
              onClick={() => run(() => setProjectMode(project.id, value))}
            >
              {MODE_LABEL[value]}
            </button>
          ))}
        </div>

        <div className="assign-work__actions">
          {project.status === "active" ? (
            <button type="button" className="assign-work__accept" disabled={busy} onClick={() => run(() => setProjectStatus(project.id, "done"))}>
              ปิดงาน (เสร็จแล้ว)
            </button>
          ) : (
            <button type="button" className="assign-work__revise" disabled={busy} onClick={() => run(() => setProjectStatus(project.id, "active"))}>
              เปิดงานอีกครั้ง
            </button>
          )}
          <button type="button" className="assign-work__del" disabled={busy} onClick={() => run(() => deleteProject(project.id))}>
            ลบ
          </button>
        </div>
        {error ? <p className="project-progress-form__error">{error}</p> : null}
      </div>

      <div className="project-card__toggles">
        <button type="button" className="project-card__toggle" onClick={onToggleOpen}>
          {open ? "ซ่อนความคืบหน้ารายวัน" : "ดูความคืบหน้ารายวัน"}
        </button>
        <button type="button" className="project-card__toggle" onClick={() => setReviewOpen((v) => !v)}>
          {reviewOpen ? "ซ่อนตรวจงาน & คะแนน" : "ตรวจงาน & คะแนน"}
        </button>
      </div>
      {reviewOpen ? <ProjectReviewPanel project={project} today={today} onChanged={onChanged} /> : null}
      {open ? (
        <ProjectProgressList
          project={project}
          today={today}
          onDelete={(progressId) => run(() => deleteProjectProgress(project.id, progressId))}
        />
      ) : null}
    </section>
  );
}
