"use client";

import { useEffect, useState } from "react";
import { ANSWER_KINDS, ANSWER_KIND_LABEL, type AnswerKind } from "../lib/checklist-overrides.ts";
import { fetchStoreTasks, importLegacyTasks, saveStoreTasks } from "../lib/store-tasks-store.ts";
import {
  FREQUENCY_LABEL,
  WEEKDAY_LABEL,
  groupByCategory,
  scheduleLabel,
  timingLabel,
  type WorkFrequency,
  type WorkSpec
} from "../lib/work-spec.ts";
import { formatEditedAt } from "../lib/daily-checklist.ts";
import type { ShiftCode } from "../lib/shift-schedule.ts";
import { weeklyEvents } from "../lib/weekly-event-tasks.ts";

// หน้าเดียวที่คุมงานสั่งทั้งร้าน — รายวัน / รายสัปดาห์ / รายเดือน อยู่ในลิสต์เดียวกัน
// ต่างกันแค่ "สั่งบ่อยแค่ไหน" กับ "ลงวันไหน" และทุกงานตั้งค่าได้เหมือนกันหมด:
// ใครทำ (กะ) · เริ่มทำได้ตั้งแต่ · ต้องจบไม่เกิน · ส่งงานแบบไหน · รายละเอียด · หมวดหมู่.

const FREQUENCIES: WorkFrequency[] = ["daily", "weekly", "monthly", "event"];
const SHIFTS: Array<{ value: ShiftCode; label: string }> = [
  { value: "s1", label: "กะ 1" },
  { value: "s2", label: "กะ 2" }
];

const MONTH_DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

function sortDays(days: number[]): number[] {
  return [...days].sort((a, b) => a - b);
}

function monthDaysOf(task: WorkSpec): number[] {
  return task.schedule.monthDays || [];
}

function monthDaysLabel(task: WorkSpec): string {
  return `ทุกวันที่ ${sortDays(monthDaysOf(task)).join(", ")}`;
}

function newTask(order: number): WorkSpec {
  return {
    id: `task-${Date.now().toString(36)}-${order}`,
    title: "",
    schedule: { frequency: "daily" },
    owners: {},
    timing: {},
    active: true,
    order
  };
}

export function StoreTaskManager({ branch }: { branch: string }) {
  const [tasks, setTasks] = useState<WorkSpec[]>([]);
  const [meta, setMeta] = useState<{ updatedAt: string | null; updatedBy: string | null }>({ updatedAt: null, updatedBy: null });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [filter, setFilter] = useState<WorkFrequency | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchStoreTasks(branch)
      .then((data) => {
        if (!alive) return;
        setTasks(data.tasks);
        setMeta({ updatedAt: data.updatedAt, updatedBy: data.updatedBy });
      })
      .catch(() => alive && setStatus("โหลดงานไม่สำเร็จ — ลองรีเฟรช"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [branch]);

  function patch(id: string, next: Partial<WorkSpec>) {
    setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, ...next } : task)));
  }

  function move(id: string, direction: -1 | 1) {
    setTasks((prev) => {
      const list = [...prev];
      const index = list.findIndex((task) => task.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= list.length) return prev;
      [list[index], list[target]] = [list[target], list[index]];
      return list.map((task, order) => ({ ...task, order }));
    });
  }

  function add() {
    const task = newTask(tasks.length);
    setTasks((prev) => [...prev, task]);
    setOpenId(task.id);
  }

  function remove(id: string) {
    setTasks((prev) => prev.filter((task) => task.id !== id).map((task, order) => ({ ...task, order })));
  }

  function toggleInList<T>(list: T[] | undefined, value: T): T[] {
    const current = list || [];
    return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
  }

  /** ดึงรายการ checklist สัปดาห์/เดือน ของเดิมเข้ามาเป็นงานในระบบนี้ (กดซ้ำได้) */
  async function importLegacy() {
    setStatus("กำลังย้ายรายการเดิม…");
    try {
      const result = await importLegacyTasks(branch);
      setTasks(result.tasks);
      setStatus(
        result.added > 0
          ? `ย้ายเข้ามา ${result.added} งาน — แก้ต่อได้เลย (ตั้งวัน กะ เวลา และวิธีส่งงาน)`
          : "ย้ายครบแล้ว ไม่มีรายการใหม่"
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "ย้ายไม่สำเร็จ");
    }
  }

  async function save() {
    const blank = tasks.find((task) => !task.title.trim());
    if (blank) {
      setStatus("มีงานที่ยังไม่ได้ตั้งชื่อ — ใส่ชื่องานก่อนบันทึก");
      return;
    }
    setStatus("กำลังบันทึก…");
    try {
      const saved = await saveStoreTasks(branch, tasks);
      setMeta(saved);
      setStatus("บันทึกแล้ว — พนักงานเห็นทันทีที่เปิดหน้างานวันนี้");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
    }
  }

  if (loading) return <p className="checklist-config__loading">กำลังโหลด…</p>;

  const shown = filter === "all" ? tasks : tasks.filter((task) => task.schedule.frequency === filter);
  const groups = groupByCategory(shown);
  const editedAt = formatEditedAt(meta.updatedAt);

  return (
    <div className="checklist-config">
      <p className="checklist-config__edited">
        {editedAt ? (
          <>แก้ไขล่าสุด {editedAt}{meta.updatedBy ? ` · โดย ${meta.updatedBy}` : ""}</>
        ) : (
          "ยังไม่เคยบันทึก — เพิ่มงานแล้วกดบันทึกทั้งหมด"
        )}
      </p>

      <div className="task-filter">
        <button type="button" className={filter === "all" ? "is-on" : ""} onClick={() => setFilter("all")}>
          ทั้งหมด ({tasks.length})
        </button>
        {FREQUENCIES.map((frequency) => (
          <button
            key={frequency}
            type="button"
            className={filter === frequency ? "is-on" : ""}
            onClick={() => setFilter(frequency)}
          >
            {FREQUENCY_LABEL[frequency]} ({tasks.filter((task) => task.schedule.frequency === frequency).length})
          </button>
        ))}
      </div>

      {groups.map((group) => (
        <section key={group.category} className="task-group">
          <p className="task-group__title">{group.category}</p>
          {group.specs.map((task) => {
            const open = openId === task.id;
            const index = tasks.findIndex((item) => item.id === task.id);
            return (
              <article key={task.id} className={`task-row soft-card${task.active ? "" : " is-off"}`}>
                <div className="task-row__head">
                  <input
                    className="checklist-config__title"
                    value={task.title}
                    onChange={(e) => patch(task.id, { title: e.target.value })}
                    placeholder="ชื่องาน เช่น นับ Sleeve ทั้งหมด"
                    aria-label="ชื่องาน"
                  />
                  <div className="checklist-config__move">
                    <button type="button" onClick={() => move(task.id, -1)} disabled={index === 0} aria-label="เลื่อนขึ้น">↑</button>
                    <button type="button" onClick={() => move(task.id, 1)} disabled={index === tasks.length - 1} aria-label="เลื่อนลง">↓</button>
                    <button type="button" onClick={() => patch(task.id, { active: !task.active })}>
                      {task.active ? "ปิดงานนี้" : "เปิดใช้"}
                    </button>
                    <button type="button" onClick={() => remove(task.id)} aria-label="ลบงาน">ลบ</button>
                  </div>
                </div>

                <p className="task-row__summary">
                  {scheduleLabel(task.schedule)} · {timingLabel(task.timing)} ·{" "}
                  {task.owners.shifts?.length ? task.owners.shifts.map((shift) => (shift === "s1" ? "กะ 1" : "กะ 2")).join(" ") : "ทุกกะ"} ·{" "}
                  {ANSWER_KIND_LABEL[task.answer?.kind || "tick"]}
                </p>

                <button type="button" className="project-card__toggle" onClick={() => setOpenId(open ? null : task.id)}>
                  {open ? "ปิดการตั้งค่า" : "ตั้งค่างานนี้"}
                </button>

                {open ? (
                  <div className="task-row__form">
                    <label>
                      หมวดหมู่ (จัดกลุ่มบนหน้าจอเฉยๆ)
                      <input
                        value={task.category || ""}
                        onChange={(e) => patch(task.id, { category: e.target.value })}
                        placeholder="เช่น เปิดร้าน · Stock · ทำความสะอาด"
                      />
                    </label>

                    <label>
                      สั่งบ่อยแค่ไหน
                      <select
                        value={task.schedule.frequency}
                        onChange={(e) =>
                          patch(task.id, { schedule: { ...task.schedule, frequency: e.target.value as WorkFrequency } })
                        }
                      >
                        {FREQUENCIES.map((frequency) => (
                          <option key={frequency} value={frequency}>{FREQUENCY_LABEL[frequency]}</option>
                        ))}
                      </select>
                    </label>

                    {task.schedule.frequency === "weekly" ? (
                      <div className="task-row__days">
                        <span>ลงวันไหนของสัปดาห์ (ไม่เลือก = ทุกวัน)</span>
                        <div className="assign-work__chips">
                          {WEEKDAY_LABEL.map((label, day) => (
                            <label key={day} className={(task.schedule.weekdays || []).includes(day) ? "assign-work__chip is-on" : "assign-work__chip"}>
                              <input
                                type="checkbox"
                                checked={(task.schedule.weekdays || []).includes(day)}
                                onChange={() =>
                                  patch(task.id, { schedule: { ...task.schedule, weekdays: toggleInList(task.schedule.weekdays, day) } })
                                }
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {task.schedule.frequency === "event" ? (
                      <label>
                        ผูกกับกิจกรรมไหน (ลงวันให้เองตามวันที่กิจกรรมจัด)
                        <select
                          value={task.schedule.eventKey || ""}
                          onChange={(e) => patch(task.id, { schedule: { ...task.schedule, eventKey: e.target.value } })}
                        >
                          <option value="">— เลือกกิจกรรม —</option>
                          {weeklyEvents.map((event) => (
                            <option key={event.key} value={event.key}>{event.name}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    {/* เลือกวันที่เป็นปุ่ม ไม่ใช่ช่องพิมพ์คั่นจุลภาค — ของเดิม parse ทุกตัวอักษรที่พิมพ์
                        จุลภาคจึงถูกลบทิ้งทันทีและใส่วันที่สองไม่ได้เลย */}
                    {task.schedule.frequency === "monthly" ? (
                      <div className="task-row__days">
                        <span>
                          ลงวันที่เท่าไหร่ของเดือน (เลือกได้หลายวัน · ไม่เลือก = วันที่ 1)
                          {monthDaysOf(task).length ? ` · ตอนนี้ ${monthDaysLabel(task)}` : ""}
                        </span>
                        <div className="assign-work__chips assign-work__chips--days">
                          {MONTH_DAYS.map((day) => (
                            <label
                              key={day}
                              className={monthDaysOf(task).includes(day) ? "assign-work__chip is-on" : "assign-work__chip"}
                            >
                              <input
                                type="checkbox"
                                checked={monthDaysOf(task).includes(day)}
                                onChange={() =>
                                  patch(task.id, {
                                    schedule: { ...task.schedule, monthDays: sortDays(toggleInList(task.schedule.monthDays, day)) }
                                  })
                                }
                              />
                              {day}
                            </label>
                          ))}
                        </div>
                        <small className="task-row__hint">
                          วันที่ 29–31 ในเดือนที่สั้นกว่านั้น ระบบจะเลื่อนมาลงวันสุดท้ายของเดือนให้เอง
                        </small>
                      </div>
                    ) : null}

                    <div className="task-row__days">
                      <span>กะที่ต้องทำ (ไม่เลือก = ทุกกะ)</span>
                      <div className="assign-work__chips">
                        {SHIFTS.map((shift) => (
                          <label key={shift.value} className={(task.owners.shifts || []).includes(shift.value) ? "assign-work__chip is-on" : "assign-work__chip"}>
                            <input
                              type="checkbox"
                              checked={(task.owners.shifts || []).includes(shift.value)}
                              onChange={() => patch(task.id, { owners: { ...task.owners, shifts: toggleInList(task.owners.shifts, shift.value) } })}
                            />
                            {shift.label}
                          </label>
                        ))}
                      </div>
                    </div>

                    <label>
                      เริ่มทำได้ตั้งแต่ (เว้นว่าง = ได้ตลอดวัน)
                      <input
                        type="time"
                        value={task.timing.openTime || ""}
                        onChange={(e) => patch(task.id, { timing: { ...task.timing, openTime: e.target.value } })}
                      />
                    </label>
                    <label>
                      ต้องจบไม่เกิน
                      <input
                        type="time"
                        value={task.timing.dueTime || ""}
                        onChange={(e) => patch(task.id, { timing: { ...task.timing, dueTime: e.target.value } })}
                      />
                    </label>

                    <label>
                      ส่งงานแบบไหน
                      <select
                        value={task.answer?.kind || "tick"}
                        onChange={(e) => {
                          const kind = e.target.value as AnswerKind;
                          patch(task.id, { answer: kind === "tick" ? undefined : { ...task.answer, kind } });
                        }}
                      >
                        {ANSWER_KINDS.map((kind) => (
                          <option key={kind} value={kind}>{ANSWER_KIND_LABEL[kind]}</option>
                        ))}
                      </select>
                    </label>

                    {task.answer && task.answer.kind !== "tick" ? (
                      <label className="task-row__wide">
                        ข้อความช่วยบอกว่าให้กรอกอะไร
                        <input
                          value={task.answer.placeholder || ""}
                          onChange={(e) => patch(task.id, { answer: { ...task.answer!, placeholder: e.target.value } })}
                          placeholder="เช่น ใส่จำนวนที่นับได้ · แนบรูปชั้นวางหลังจัดเสร็จ"
                        />
                      </label>
                    ) : null}

                    {task.answer?.kind === "choice" ? (
                      <label className="task-row__wide">
                        ตัวเลือก (บรรทัดละ 1)
                        <textarea
                          rows={3}
                          value={(task.answer.options || []).join("\n")}
                          onChange={(e) => patch(task.id, { answer: { ...task.answer!, options: e.target.value.split("\n") } })}
                          placeholder={"ครบ\nไม่ครบ"}
                        />
                      </label>
                    ) : null}

                    <label className="task-row__wide">
                      รายละเอียด (พนักงานอ่านก่อนทำ)
                      <textarea
                        rows={2}
                        value={task.detail || ""}
                        onChange={(e) => patch(task.id, { detail: e.target.value })}
                        placeholder="อธิบายว่าต้องทำอะไร / ทำยังไง"
                      />
                    </label>
                    <label className="task-row__wide">
                      งานเสร็จหน้าตาเป็นยังไง
                      <textarea
                        rows={2}
                        value={task.expectedResult || ""}
                        onChange={(e) => patch(task.id, { expectedResult: e.target.value })}
                        placeholder="เช่น ชั้นวางเต็มทุกช่อง ป้ายราคาครบ"
                      />
                    </label>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      ))}

      {shown.length === 0 ? <p className="assign-work__empty">ยังไม่มีงานในหมวดนี้</p> : null}

      <div className="checklist-config__bar">
        <button type="button" className="btn-soft" onClick={add}>+ เพิ่มงาน</button>
        <button type="button" className="btn-soft" onClick={importLegacy}>ย้ายรายการเดิมเข้ามา</button>
        <button type="button" className="primary-action" onClick={save}>บันทึกทั้งหมด</button>
        {status ? <span className="checklist-config__status">{status}</span> : null}
      </div>
    </div>
  );
}
