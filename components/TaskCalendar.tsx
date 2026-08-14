"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "./Modal.tsx";
import { ProjectAssignForm, type StaffOption } from "./ProjectAssignForm.tsx";
import type { TeamOption } from "../lib/team-options.ts";
import { ANSWER_KINDS, ANSWER_KIND_LABEL, type AnswerKind } from "../lib/checklist-overrides.ts";
import { fetchStoreTasks, saveStoreTasks } from "../lib/store-tasks-store.ts";
import { isDueOn, scheduleLabel, timingLabel, type WorkSpec } from "../lib/work-spec.ts";
import { weeklyEvents, weeklyEventsActiveOn } from "../lib/weekly-event-tasks.ts";
import type { ShiftCode } from "../lib/shift-schedule.ts";

// ปฏิทินสั่งงาน — เห็นทั้งเดือนว่าวันไหนมีงานอะไร มีกิจกรรมอะไร แล้วกดวันนั้นสั่งงานเพิ่มได้เลย
// (งานที่สั่งจากปฏิทิน = งานครั้งเดียวของวันนั้น) ส่วนงานประจำที่ผูกกับกิจกรรมจะขึ้นเองทุกวันที่จัด.

const WEEK_HEADS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const SHIFTS: Array<{ value: ShiftCode; label: string }> = [
  { value: "s1", label: "กะ 1" },
  { value: "s2", label: "กะ 2" }
];

function monthDates(monthKey: string): string[] {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: days }, (_, index) => `${monthKey}-${String(index + 1).padStart(2, "0")}`);
}

function shiftMonth(monthKey: string, delta: number): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7)) - 1 + delta;
  const date = new Date(Date.UTC(year, month, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function TaskCalendar({
  branch,
  today,
  staff = [],
  teams = []
}: {
  branch: string;
  today: string;
  staff?: StaffOption[];
  teams?: TeamOption[];
}) {
  const [tasks, setTasks] = useState<WorkSpec[]>([]);
  const [monthKey, setMonthKey] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  // ฟอร์มสั่งงานของวันที่เลือก
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [category, setCategory] = useState("");
  const [shifts, setShifts] = useState<ShiftCode[]>([]);
  const [openTime, setOpenTime] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [answerKind, setAnswerKind] = useState<AnswerKind>("tick");
  const [repeatEvent, setRepeatEvent] = useState("");
  // ฟอร์มยาวไม่ต้องอยู่บนหน้าตลอด — กดวันแล้วค่อยเปิดหน้าต่างที่ต้องการ
  const [openForm, setOpenForm] = useState<"none" | "routine" | "assign">("none");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchStoreTasks(branch)
      .then((data) => alive && setTasks(data.tasks))
      .catch(() => alive && setStatus("โหลดงานไม่สำเร็จ"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [branch]);

  const dates = useMemo(() => monthDates(monthKey), [monthKey]);
  const leading = new Date(`${dates[0]}T12:00:00+07:00`).getUTCDay();
  const tasksOn = (date: string) => tasks.filter((task) => task.active && isDueOn(task.schedule, date));
  const selectedTasks = tasksOn(selected);
  const dayEvents = weeklyEventsActiveOn(selected);

  async function addTask() {
    if (!title.trim()) {
      setStatus("ใส่ชื่องานก่อน");
      return;
    }
    // เลือกกิจกรรมไว้ = สั่งเป็นงานประจำของทุกวันที่มีกิจกรรมนั้น · ไม่เลือก = งานของวันที่กดเท่านั้น
    const schedule: WorkSpec["schedule"] = repeatEvent
      ? { frequency: "event", eventKey: repeatEvent }
      : { frequency: "once", startDate: selected };
    const task: WorkSpec = {
      id: `task-${Date.now().toString(36)}`,
      title: title.trim(),
      ...(detail.trim() ? { detail: detail.trim() } : {}),
      ...(category.trim() ? { category: category.trim() } : {}),
      schedule,
      owners: shifts.length ? { shifts } : {},
      timing: { ...(openTime ? { openTime } : {}), ...(dueTime ? { dueTime } : {}) },
      ...(answerKind === "tick" ? {} : { answer: { kind: answerKind } }),
      active: true,
      order: tasks.length
    };
    const next = [...tasks, task];
    setStatus("กำลังบันทึก…");
    try {
      await saveStoreTasks(branch, next);
      setTasks(next);
      setTitle("");
      setDetail("");
      setStatus(repeatEvent ? "สั่งแล้ว — ขึ้นทุกวันที่มีกิจกรรมนี้" : `สั่งแล้ว — ขึ้นในวันที่ ${selected}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
    }
  }

  if (loading) return <p className="checklist-config__loading">กำลังโหลด…</p>;

  return (
    <div className="task-calendar">
      <div className="task-calendar__bar">
        <button type="button" onClick={() => setMonthKey(shiftMonth(monthKey, -1))} aria-label="เดือนก่อน">←</button>
        <strong>{monthKey}</strong>
        <button type="button" onClick={() => setMonthKey(shiftMonth(monthKey, 1))} aria-label="เดือนถัดไป">→</button>
      </div>

      <div className="task-calendar__grid" role="grid">
        {WEEK_HEADS.map((head) => (
          <span key={head} className="task-calendar__head">{head}</span>
        ))}
        {Array.from({ length: leading }, (_, index) => (
          <span key={`pad-${index}`} className="task-calendar__pad" />
        ))}
        {dates.map((date) => {
          const count = tasksOn(date).length;
          const events = weeklyEventsActiveOn(date);
          return (
            <button
              key={date}
              type="button"
              className={`task-calendar__day${date === selected ? " is-selected" : ""}${date === today ? " is-today" : ""}`}
              onClick={() => setSelected(date)}
            >
              <span className="task-calendar__date">{Number(date.slice(8, 10))}</span>
              {count ? <span className="task-calendar__count">{count} งาน</span> : null}
              {events.length ? <span className="task-calendar__event">{events.map((event) => event.game).join(" · ")}</span> : null}
            </button>
          );
        })}
      </div>

      <section className="task-calendar__day-panel soft-card">
        <p className="assign-work__label">วันที่ {selected}</p>
        {dayEvents.length ? (
          <p className="task-calendar__day-events">
            วันนี้มีกิจกรรม: {dayEvents.map((event) => event.name).join(" · ")}
          </p>
        ) : null}

        {selectedTasks.length ? (
          <ul className="task-calendar__list">
            {selectedTasks.map((task) => (
              <li key={task.id}>
                <strong>{task.title}</strong>
                <em>
                  {scheduleLabel(task.schedule)} · {timingLabel(task.timing)}
                  {task.owners.shifts?.length ? ` · ${task.owners.shifts.map((s) => (s === "s1" ? "กะ 1" : "กะ 2")).join(" ")}` : ""}
                  {` · ${ANSWER_KIND_LABEL[task.answer?.kind || "tick"]}`}
                </em>
              </li>
            ))}
          </ul>
        ) : (
          <p className="assign-work__empty">วันนี้ยังไม่มีงาน</p>
        )}

        <div className="task-calendar__actions">
          <button type="button" className="primary-action" onClick={() => setOpenForm("assign")}>
            มอบหมายงาน (เดี่ยว / กลุ่ม)
          </button>
          <button type="button" className="btn-soft" onClick={() => setOpenForm("routine")}>
            สั่งงานประจำวันนี้
          </button>
          {status ? <span className="checklist-config__status">{status}</span> : null}
        </div>
      </section>

      {openForm === "routine" ? (
        <Modal title={`สั่งงานประจำ · วันที่ ${selected}`} onClose={() => setOpenForm("none")}>
        <div className="task-row__form">
            <label className="task-row__wide">
              สั่งงานเพิ่มในวันนี้
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ชื่องาน เช่น เตรียมของรางวัล Gym" />
            </label>
            <label className="task-row__wide">
              รายละเอียด
              <textarea rows={2} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="ต้องทำอะไร / ทำยังไง" />
            </label>
            <label>
              หมวดหมู่
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="เช่น กิจกรรม" />
            </label>
            <label>
              ส่งงานแบบไหน
              <select value={answerKind} onChange={(e) => setAnswerKind(e.target.value as AnswerKind)}>
                {ANSWER_KINDS.map((kind) => (
                  <option key={kind} value={kind}>{ANSWER_KIND_LABEL[kind]}</option>
                ))}
              </select>
            </label>
            <label>
              เริ่มทำได้ตั้งแต่
              <input type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} />
            </label>
            <label>
              ต้องจบไม่เกิน
              <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
            </label>
            <div className="task-row__days">
              <span>กะที่ต้องทำ (ไม่เลือก = ทุกกะ)</span>
              <div className="assign-work__chips">
                {SHIFTS.map((shift) => (
                  <label key={shift.value} className={shifts.includes(shift.value) ? "assign-work__chip is-on" : "assign-work__chip"}>
                    <input
                      type="checkbox"
                      checked={shifts.includes(shift.value)}
                      onChange={() =>
                        setShifts((prev) => (prev.includes(shift.value) ? prev.filter((s) => s !== shift.value) : [...prev, shift.value]))
                      }
                    />
                    {shift.label}
                  </label>
                ))}
              </div>
            </div>
            <label className="task-row__wide">
              ทำทุกครั้งที่มีกิจกรรมนี้ (เว้นว่าง = เฉพาะวันที่เลือก)
              <select value={repeatEvent} onChange={(e) => setRepeatEvent(e.target.value)}>
                <option value="">— เฉพาะวันที่ {selected} —</option>
                {weeklyEvents.map((event) => (
                  <option key={event.key} value={event.key}>ทุกวันที่มี {event.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="checklist-config__bar">
            <button type="button" className="primary-action" onClick={addTask}>สั่งงาน</button>
            {status ? <span className="checklist-config__status">{status}</span> : null}
          </div>
        </Modal>
      ) : null}

      {openForm === "assign" ? (
        <Modal title={`มอบหมายงาน · วันที่ ${selected}`} onClose={() => setOpenForm("none")}>
          <ProjectAssignForm
            branch={branch}
            staff={staff}
            teams={teams}
            defaultStartDate={selected}
            contextNote={
              dayEvents.length
                ? `วันที่ ${selected} · มีกิจกรรม ${dayEvents.map((event) => event.name).join(" · ")}`
                : `วันที่ ${selected}`
            }
            onCreated={() => {
              setStatus(`มอบหมายงานของวันที่ ${selected} แล้ว`);
              setOpenForm("none");
            }}
          />
        </Modal>
      ) : null}
    </div>
  );
}
