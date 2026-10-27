"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Hand, Pencil, Plus } from "lucide-react";
import { MASTERPLAN_MEMBERS, memberName } from "../../lib/masterplan-access.ts";
import { mpApi, useLocalDraft } from "../../lib/masterplan-client.ts";
import { MISSIONS, TASK_STATUSES, isOverdue, validateTaskDraft, type Mission, type MpTask, type TaskDraft, type TaskStatus } from "../../lib/masterplan.ts";

// งาน — grouped by status (stacked on mobile, columns on wide screens). Filters stay in
// localStorage so the view comes back the way it was left.

type Filters = { owner: string; mission: string; due: string };
const memberKeys = MASTERPLAN_MEMBERS.map((m) => m.key as string);

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function TaskBoard({ tasks, me, today }: { tasks: MpTask[]; me: string; today: string }) {
  const [filters, setFilters] = useLocalDraft<Filters>("mp-task-filters", { owner: "", mission: "", due: "" });
  const [creating, setCreating] = useState(false);
  const weekEnd = addDays(today, 7);
  const set = (field: keyof Filters, value: string) => setFilters((prev) => ({ ...prev, [field]: value }));

  const filtered = tasks.filter((task) => {
    if (filters.owner === "none" ? task.owner !== null : filters.owner && task.owner !== filters.owner) return false;
    if (filters.mission && !task.missions.includes(filters.mission as Mission)) return false;
    if (filters.due === "overdue" && !isOverdue(task, today)) return false;
    if (filters.due === "week" && !(task.due && task.due >= today && task.due <= weekEnd)) return false;
    if (filters.due === "none" && task.due) return false;
    return true;
  });

  return (
    <>
      <div className="mp-toolbar">
        <label className="mp-field mp-field--inline">
          <span>คนทำ</span>
          <select value={filters.owner} onChange={(e) => set("owner", e.target.value)}>
            <option value="">ทุกคน</option>
            {MASTERPLAN_MEMBERS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.key === me ? `${m.name} (ฉัน)` : m.name}
              </option>
            ))}
            <option value="none">ยังไม่มีคนหยิบ</option>
          </select>
        </label>
        <label className="mp-field mp-field--inline">
          <span>Mission</span>
          <select value={filters.mission} onChange={(e) => set("mission", e.target.value)}>
            <option value="">ทั้งหมด</option>
            {MISSIONS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="mp-field mp-field--inline">
          <span>กำหนดส่ง</span>
          <select value={filters.due} onChange={(e) => set("due", e.target.value)}>
            <option value="">ทั้งหมด</option>
            <option value="overdue">เลยกำหนด</option>
            <option value="week">ภายใน 7 วัน</option>
            <option value="none">ไม่มีกำหนด</option>
          </select>
        </label>
        <button type="button" className="mp-btn mp-btn--primary" onClick={() => setCreating((v) => !v)} aria-expanded={creating}>
          <Plus size={16} aria-hidden="true" /> เพิ่มงาน
        </button>
      </div>
      {creating ? <TaskForm draftKey="mp-new-task" onClose={() => setCreating(false)} /> : null}

      <p className="mp-meta">
        แสดง {filtered.length} จาก {tasks.length} งาน
      </p>
      <div className="mp-board">
        {TASK_STATUSES.map((status) => {
          const items = filtered.filter((t) => t.status === status);
          return (
            <div key={status} className="mp-board__col">
              <h2 className="mp-board__head">
                {status} <span className="mp-count">{items.length}</span>
              </h2>
              {items.length === 0 ? <p className="mp-empty mp-empty--small">-</p> : null}
              <ul className="mp-list">
                {items.map((task) => (
                  <TaskRow key={task.id} task={task} me={me} today={today} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </>
  );
}

function TaskRow({ task, me, today }: { task: MpTask; me: string; today: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overdue = isOverdue(task, today);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await mpApi("tasks", "PATCH", { id: task.id, ...body });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  if (editing) {
    return (
      <li className="mp-task">
        <TaskForm draftKey={`mp-edit-task-${task.id}`} task={task} onClose={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className={`mp-task${overdue ? " is-overdue" : ""}`}>
      <div className="mp-prop__top">
        <span className="mp-code">{task.code}</span>
        {task.missions.length ? <span className="mp-meta">{task.missions.join(" ")}</span> : null}
      </div>
      <p className="mp-task__title">{task.title}</p>
      {task.detail ? <p className="mp-task__detail">{task.detail}</p> : null}
      <p className="mp-meta">
        {task.owner ? memberName(task.owner) : "ยังไม่มีคนหยิบ"} ·{" "}
        <span className={overdue ? "mp-overdue" : undefined}>{task.due ? `ส่ง ${task.due}${overdue ? " (เลยกำหนด)" : ""}` : "ไม่มีกำหนด"}</span>
      </p>
      {error ? (
        <p className="mp-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mp-prop__tools">
        {task.owner !== me && task.status !== "เสร็จ" ? (
          <button type="button" className="mp-tool mp-tool--strong" disabled={busy} onClick={() => void patch({ action: "claim" })}>
            <Hand size={15} aria-hidden="true" /> หยิบงาน
          </button>
        ) : null}
        <label className="mp-sr" htmlFor={`st-${task.id}`}>
          สถานะ
        </label>
        <select
          id={`st-${task.id}`}
          className="mp-select-sm"
          value={task.status}
          disabled={busy}
          onChange={(e) => void patch({ action: "status", status: e.target.value as TaskStatus })}
        >
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button type="button" className="mp-tool" onClick={() => setEditing(true)}>
          <Pencil size={15} aria-hidden="true" /> แก้
        </button>
      </div>
    </li>
  );
}

function TaskForm({ draftKey, task, onClose }: { draftKey: string; task?: MpTask; onClose: () => void }) {
  const router = useRouter();
  const [draft, setDraft, clear] = useLocalDraft<TaskDraft>(draftKey, {
    title: task?.title ?? "",
    detail: task?.detail ?? "",
    missions: task?.missions ?? [],
    owner: task?.owner ?? null,
    due: task?.due ?? null,
    status: task?.status ?? "ยังไม่เริ่ม"
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof TaskDraft>(field: K, value: TaskDraft[K]) => setDraft((prev) => ({ ...prev, [field]: value }));

  async function save() {
    const checked = validateTaskDraft(draft, memberKeys);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setBusy(true);
    setError(null);
    const res = task
      ? await mpApi("tasks", "PATCH", { id: task.id, action: "update", draft: checked.value })
      : await mpApi("tasks", "POST", { action: "create", draft: checked.value });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    clear();
    onClose();
    router.refresh();
  }

  return (
    <form
      className="mp-form mp-inline"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className="mp-field">
        <span>ชื่องาน</span>
        <input value={draft.title} onChange={(e) => set("title", e.target.value)} maxLength={200} />
      </label>
      <label className="mp-field">
        <span>รายละเอียด</span>
        <textarea className="mp-textarea" rows={3} value={draft.detail} onChange={(e) => set("detail", e.target.value)} />
      </label>
      <div className="mp-field">
        <span>Mission</span>
        <div className="mp-chips" role="group" aria-label="Mission">
          {MISSIONS.map((m) => (
            <button
              key={m}
              type="button"
              className={`mp-chip${draft.missions.includes(m) ? " is-on" : ""}`}
              aria-pressed={draft.missions.includes(m)}
              onClick={() => set("missions", draft.missions.includes(m) ? draft.missions.filter((x) => x !== m) : [...draft.missions, m])}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <div className="mp-row2">
        <label className="mp-field">
          <span>คนทำ</span>
          <select value={draft.owner ?? ""} onChange={(e) => set("owner", e.target.value || null)}>
            <option value="">ยังไม่มีคนหยิบ</option>
            {MASTERPLAN_MEMBERS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="mp-field">
          <span>กำหนดส่ง</span>
          <input type="date" value={draft.due ?? ""} onChange={(e) => set("due", e.target.value || null)} />
        </label>
      </div>
      {error ? (
        <p className="mp-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mp-actions">
        <button type="submit" className="mp-btn mp-btn--primary" disabled={busy}>
          {busy ? "กำลังบันทึก…" : task ? "บันทึกงาน" : "เพิ่มงาน"}
        </button>
        <button type="button" className="mp-btn mp-btn--quiet" onClick={onClose}>
          ปิด
        </button>
      </div>
    </form>
  );
}
