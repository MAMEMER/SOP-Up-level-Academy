"use client";

import { useCallback, useEffect, useState } from "react";
import { ProjectMeter } from "./ProjectMeter.tsx";
import { ProjectProgressList } from "./ProjectProgressList.tsx";
import { displayNameFor } from "../lib/employee-directory.ts";
import { isTeamSelected, toggleTeamSelection, type TeamOption } from "../lib/team-options.ts";
import { ANSWER_KINDS, ANSWER_KIND_LABEL, type AnswerKind } from "../lib/checklist-overrides.ts";
import {
  createProject,
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
  validateProjectDraft,
  type WorkProject
} from "../lib/work-projects.ts";

type StaffOption = { code: string; displayName: string; employmentType: "full_time" | "part_time" };

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  // ฟอร์มสร้างงานใหม่
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [expectedResult, setExpectedResult] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDays(today, 6));
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [mode, setMode] = useState<"single" | "group">("single");
  const [openTime, setOpenTime] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [answerKind, setAnswerKind] = useState<AnswerKind>("tick");

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

  function toggleCode(code: string) {
    setSelectedCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  async function submit() {
    const draft = { title: title.trim(), startDate, endDate, assignees: selectedCodes };
    const invalid = validateProjectDraft(draft);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await createProject({
        branch,
        title: draft.title,
        detail: detail.trim() || undefined,
        expectedResult: expectedResult.trim() || undefined,
        startDate,
        endDate,
        assignees: selectedCodes,
        mode,
        openTime: openTime || undefined,
        dueTime: dueTime || undefined,
        ...(answerKind === "tick" ? {} : { answer: { kind: answerKind } })
      });
      setTitle("");
      setDetail("");
      setExpectedResult("");
      setSelectedCodes([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "มอบหมายงานไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const days = totalDays(startDate, endDate);

  return (
    <div className="assign-work">
      <section className="assign-work__form soft-card">
        <p className="assign-work__label">มอบหมายงาน (เดี่ยว / กลุ่ม)</p>
        <p className="assign-work__hint-lead">
          บอก <strong>ทำอะไร · ใครทำ · วันไหนถึงวันไหน · ส่งงานแบบไหน</strong> — วันเดียวก็ได้ หลายวันก็ส่ง progress ทุกวัน
        </p>

        <div className="assign-work__field">
          <span className="assign-work__field-label">1. ผู้รับผิดชอบ <span className="assign-work__req">*</span> — เลือกได้หลายคน</span>
          <div className="assign-work__staff-pick">
            {teams.length > 0 ? (
              <div className="assign-work__team-pick">
                <span className="assign-work__pick-label">เลือกทั้งทีม</span>
                <div className="assign-work__chips">
                  {teams.map((team) => {
                    const on = isTeamSelected(selectedCodes, team.memberCodes);
                    const empty = team.memberCodes.length === 0;
                    return (
                      <button
                        type="button"
                        key={team.key}
                        className={on ? "assign-work__chip assign-work__chip--team is-on" : "assign-work__chip assign-work__chip--team"}
                        onClick={() => setSelectedCodes((prev) => toggleTeamSelection(prev, team.memberCodes))}
                        disabled={empty}
                      >
                        {on ? "✓ " : ""}{team.label}{empty ? " (ยังไม่มีสมาชิก)" : ` (${team.memberCodes.length})`}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="assign-work__chips">
              {staff.map((person) => (
                <label key={person.code} className={selectedCodes.includes(person.code) ? "assign-work__chip is-on" : "assign-work__chip"}>
                  <input type="checkbox" checked={selectedCodes.includes(person.code)} onChange={() => toggleCode(person.code)} />
                  {person.displayName} ({person.employmentType === "full_time" ? "Full" : "Part"})
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="assign-work__field">
          <span className="assign-work__field-label">2. ต้องทำอะไร <span className="assign-work__req">*</span></span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ชื่อโปรเจกต์ เช่น จัดร้านใหม่โซนการ์ดเดี่ยว" />
          <textarea
            className="assign-work__detail"
            rows={3}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="รายละเอียด/ขอบเขตงาน เช่น ย้ายตู้ 4 ตู้ · จัดการ์ดใหม่ตามชุด · ทำป้ายราคาใหม่"
          />
        </div>

        <div className="assign-work__field">
          <span className="assign-work__field-label">3. งานเสร็จหน้าตาเป็นยังไง</span>
          <textarea
            className="assign-work__detail"
            rows={2}
            value={expectedResult}
            onChange={(e) => setExpectedResult(e.target.value)}
            placeholder="เช่น ตู้ทุกตู้จัดครบ มีป้ายราคาทุกใบ ถ่ายรูปหน้าร้านส่ง 3 รูป"
          />
        </div>

        <div className="assign-work__field">
          <span className="assign-work__field-label">4. ช่วงเวลา <span className="assign-work__req">*</span></span>
          <div className="assign-work__due-row">
            <label>
              ตั้งแต่วันที่
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label>
              ถึงวันที่
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
            <span className="project-form__days">
              รวม {days} วัน{days === 1 ? " (งานวันเดียว — ส่งครั้งเดียวจบ)" : ""}
            </span>
          </div>
        </div>

        <div className="assign-work__field">
          <span className="assign-work__field-label">5. เดี่ยวหรือกลุ่ม · เวลา · วิธีส่งงาน</span>
          <div className="assign-work__chips">
            {(["single", "group"] as const).map((value) => (
              <button
                type="button"
                key={value}
                className={mode === value ? "assign-work__chip is-on" : "assign-work__chip"}
                onClick={() => setMode(value)}
              >
                {MODE_LABEL[value]}{value === "group" ? " (ใครในทีมส่งก็นับ)" : " (คนที่รับผิดชอบส่งเอง)"}
              </button>
            ))}
          </div>
          <div className="assign-work__due-row">
            <label>
              เริ่มส่งได้ตั้งแต่
              <input type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} />
            </label>
            <label>
              ต้องจบไม่เกิน
              <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
            </label>
            <label>
              ส่งงานแบบไหน
              <select value={answerKind} onChange={(e) => setAnswerKind(e.target.value as AnswerKind)}>
                {ANSWER_KINDS.map((kind) => (
                  <option key={kind} value={kind}>{ANSWER_KIND_LABEL[kind]}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {error ? <p className="project-progress-form__error">{error}</p> : null}
        <button
          type="button"
          className="primary-action"
          onClick={submit}
          disabled={busy || !title.trim() || selectedCodes.length === 0}
        >
          {busy ? "กำลังมอบหมาย…" : `มอบหมายงาน${selectedCodes.length > 1 ? ` (${selectedCodes.length} คน)` : ""}`}
        </button>
      </section>

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

      <button type="button" className="project-card__toggle" onClick={onToggleOpen}>
        {open ? "ซ่อนความคืบหน้ารายวัน" : "ดูความคืบหน้ารายวัน"}
      </button>
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
