"use client";

import { useEffect, useState } from "react";
import type { WorkflowPhase } from "../lib/card-store-workflow.ts";
import {
  CHECKLIST_DAY_END,
  emptyChecklistConfig,
  isHhMm,
  seedOverridesFromPhases,
  seedShiftsFromPhases,
  seedWindowsFromPhases,
  type ChecklistConfig
} from "../lib/daily-checklist.ts";
import { fetchChecklistConfig, saveChecklistConfig } from "../lib/daily-checklist-store.ts";
import type { ShiftCode } from "../lib/shift-schedule.ts";

// Owner editor for the daily checklist. Loads the current config (or seeds it from the
// built-in phases), lets the owner edit the items, the submit window, the order of the
// หัวข้อ and which shift each one belongs to, then saves the whole thing back to Firestore.
// The staff checklist page picks the changes up on reload.

const shiftChoices: Array<{ value: ShiftCode; label: string }> = [
  { value: "s1", label: "กะ 1 (เปิดร้าน)" },
  { value: "s2", label: "กะ 2 (ปิดร้าน)" }
];

export function DailyChecklistEditor({
  phases,
  branch,
  editedBy
}: {
  phases: WorkflowPhase[];
  branch: string;
  editedBy: string;
}) {
  const [draft, setDraft] = useState<ChecklistConfig>(emptyChecklistConfig);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchChecklistConfig(branch)
      .then((data) => alive && setDraft(seedConfig(phases, data)))
      .catch(() => alive && setDraft(seedConfig(phases, emptyChecklistConfig)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch]);

  function seedConfig(source: WorkflowPhase[], config: ChecklistConfig): ChecklistConfig {
    const ordered = config.order.filter((phaseId) => source.some((phase) => phase.id === phaseId));
    return {
      overrides: seedOverridesFromPhases(source, config.overrides),
      windows: seedWindowsFromPhases(source, config.windows),
      shifts: seedShiftsFromPhases(source, config.shifts),
      order: [...ordered, ...source.map((phase) => phase.id).filter((phaseId) => !ordered.includes(phaseId))]
    };
  }

  /** Phases in the order the owner arranged them (falls back to the built-in order). */
  const orderedPhases = draft.order.length
    ? draft.order.map((phaseId) => phases.find((phase) => phase.id === phaseId)).filter(Boolean as unknown as (p: WorkflowPhase | undefined) => p is WorkflowPhase)
    : phases;

  function updateItem(phaseId: string, index: number, value: string) {
    setDraft((prev) => ({
      ...prev,
      overrides: { ...prev.overrides, [phaseId]: (prev.overrides[phaseId] || []).map((item, i) => (i === index ? value : item)) }
    }));
  }

  function addItem(phaseId: string) {
    setDraft((prev) => ({ ...prev, overrides: { ...prev.overrides, [phaseId]: [...(prev.overrides[phaseId] || []), ""] } }));
  }

  function removeItem(phaseId: string, index: number) {
    setDraft((prev) => ({
      ...prev,
      overrides: { ...prev.overrides, [phaseId]: (prev.overrides[phaseId] || []).filter((_, i) => i !== index) }
    }));
  }

  function updateWindow(phaseId: string, field: "openTime" | "dueTime", value: string) {
    setDraft((prev) => {
      const current = prev.windows[phaseId] || { dueTime: CHECKLIST_DAY_END };
      const next = field === "dueTime" ? { ...current, dueTime: value } : { ...current, openTime: value || undefined };
      return { ...prev, windows: { ...prev.windows, [phaseId]: next } };
    });
  }

  function toggleShift(phaseId: string, shift: ShiftCode) {
    setDraft((prev) => {
      const current = prev.shifts[phaseId] || [];
      const next = current.includes(shift) ? current.filter((item) => item !== shift) : [...current, shift];
      return { ...prev, shifts: { ...prev.shifts, [phaseId]: next } };
    });
  }

  function movePhase(phaseId: string, direction: -1 | 1) {
    setDraft((prev) => {
      const order = prev.order.length ? [...prev.order] : phases.map((phase) => phase.id);
      const index = order.indexOf(phaseId);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= order.length) return prev;
      [order[index], order[target]] = [order[target], order[index]];
      return { ...prev, order };
    });
  }

  async function save() {
    // Drop blank rows and refuse a broken time before persisting — staff read these,
    // and a bad deadline turns straight into a KPI deduction.
    const overrides: ChecklistConfig["overrides"] = {};
    for (const [phaseId, items] of Object.entries(draft.overrides)) {
      overrides[phaseId] = items.map((item) => item.trim()).filter(Boolean);
    }
    const badTime = Object.entries(draft.windows).find(
      ([, window]) => !isHhMm(window.dueTime) || (window.openTime !== undefined && window.openTime !== "" && !isHhMm(window.openTime))
    );
    if (badTime) {
      setStatus(`เวลาไม่ถูกต้องที่หัวข้อ ${badTime[0]} — ใช้รูปแบบ HH:MM`);
      return;
    }

    setStatus("กำลังบันทึก…");
    try {
      await saveChecklistConfig({ branch, config: { ...draft, overrides }, updatedBy: editedBy });
      setStatus("บันทึกแล้ว — checklist ของ staff อัปเดตแล้ว");
    } catch {
      setStatus("บันทึกไม่สำเร็จ");
    }
  }

  if (loading) return <p className="checklist-config__loading">กำลังโหลด…</p>;

  return (
    <div className="checklist-config">
      {orderedPhases.map((phase, index) => {
        const window = draft.windows[phase.id] || { dueTime: CHECKLIST_DAY_END };
        const shifts = draft.shifts[phase.id] || [];
        return (
          <section key={phase.id} className="checklist-config__phase soft-card">
            <div className="checklist-config__phase-head">
              <strong>{phase.title}</strong>
              <div className="checklist-config__move">
                <button type="button" onClick={() => movePhase(phase.id, -1)} disabled={index === 0} aria-label="เลื่อนขึ้น">↑</button>
                <button type="button" onClick={() => movePhase(phase.id, 1)} disabled={index === orderedPhases.length - 1} aria-label="เลื่อนลง">↓</button>
              </div>
            </div>

            <div className="checklist-config__window">
              <label>
                กำหนดส่ง (สายกว่านี้หัก 2 คะแนน)
                <input type="time" value={window.dueTime} onChange={(e) => updateWindow(phase.id, "dueTime", e.target.value)} />
              </label>
              <label>
                เริ่มส่งได้ตั้งแต่ (เว้นว่าง = ส่งได้ทั้งวัน)
                <input type="time" value={window.openTime || ""} onChange={(e) => updateWindow(phase.id, "openTime", e.target.value)} />
              </label>
              <div className="checklist-config__shifts">
                <span>กะที่ต้องทำ</span>
                {shiftChoices.map((choice) => (
                  <label key={choice.value}>
                    <input type="checkbox" checked={shifts.includes(choice.value)} onChange={() => toggleShift(phase.id, choice.value)} />
                    {choice.label}
                  </label>
                ))}
                <small>{shifts.length === 0 || shifts.length === 2 ? "ทั้งสองกะเห็นหัวข้อนี้" : "เห็นเฉพาะกะที่ติ๊ก"}</small>
              </div>
            </div>

            <ul className="checklist-config__items">
              {(draft.overrides[phase.id] ?? []).map((item, itemIndex) => (
                <li key={itemIndex}>
                  <input value={item} onChange={(e) => updateItem(phase.id, itemIndex, e.target.value)} placeholder="รายการ checklist" />
                  <button type="button" onClick={() => removeItem(phase.id, itemIndex)} aria-label="ลบ">✕</button>
                </li>
              ))}
            </ul>
            <button type="button" className="checklist-config__add" onClick={() => addItem(phase.id)}>+ เพิ่มรายการ</button>
          </section>
        );
      })}

      <div className="checklist-config__bar">
        <button type="button" className="primary-action" onClick={save}>บันทึกทั้งหมด</button>
        {status ? <span className="checklist-config__status">{status}</span> : null}
      </div>
    </div>
  );
}
