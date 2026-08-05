"use client";

import { useEffect, useState } from "react";
import type { WorkflowPhase } from "../lib/card-store-workflow.ts";
import {
  CHECKLIST_DAY_END,
  customPhaseId,
  customPhaseToWorkflowPhase,
  emptyChecklistConfig,
  isHhMm,
  moveChecklistItem,
  moveChecklistItemWithin,
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
  const [newPhaseTitle, setNewPhaseTitle] = useState("");
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
    // The editor works on every หัวข้อ that exists — built-in plus the owner's own — so a
    // custom one is seeded from its stored items just like a built-in one is from code.
    const all = [
      ...source,
      ...config.customPhases.map((phase) => customPhaseToWorkflowPhase(phase, config.overrides[phase.id] || []))
    ];
    const ordered = config.order.filter((phaseId) => all.some((phase) => phase.id === phaseId));
    return {
      ...config,
      overrides: seedOverridesFromPhases(all, config.overrides),
      windows: seedWindowsFromPhases(all, config.windows),
      shifts: seedShiftsFromPhases(all, config.shifts),
      order: [...ordered, ...all.map((phase) => phase.id).filter((phaseId) => !ordered.includes(phaseId))]
    };
  }

  /** Every หัวข้อ the editor shows: built-in first, then the owner's, in the saved order. */
  const allPhases: WorkflowPhase[] = [
    ...phases,
    ...draft.customPhases.map((phase) => customPhaseToWorkflowPhase(phase, draft.overrides[phase.id] || []))
  ];
  const orderedPhases = draft.order.length
    ? draft.order
        .map((phaseId) => allPhases.find((phase) => phase.id === phaseId))
        .filter(Boolean as unknown as (p: WorkflowPhase | undefined) => p is WorkflowPhase)
    : allPhases;

  const isCustom = (phaseId: string) => draft.customPhases.some((phase) => phase.id === phaseId);
  const isHidden = (phaseId: string) => draft.hiddenPhases.includes(phaseId);
  const titleOf = (phase: WorkflowPhase) => draft.titles[phase.id] ?? phase.title;

  function renamePhase(phaseId: string, value: string) {
    setDraft((prev) => ({ ...prev, titles: { ...prev.titles, [phaseId]: value } }));
  }

  /** Built-in หัวข้อ cannot be deleted (they live in code) — they are switched off instead. */
  function toggleHidden(phaseId: string) {
    setDraft((prev) => ({
      ...prev,
      hiddenPhases: prev.hiddenPhases.includes(phaseId)
        ? prev.hiddenPhases.filter((id) => id !== phaseId)
        : [...prev.hiddenPhases, phaseId]
    }));
  }

  function removeCustomPhase(phaseId: string) {
    setDraft((prev) => {
      const { [phaseId]: _items, ...overrides } = prev.overrides;
      const { [phaseId]: _title, ...titles } = prev.titles;
      const { [phaseId]: _window, ...windows } = prev.windows;
      return {
        ...prev,
        overrides,
        titles,
        windows,
        customPhases: prev.customPhases.filter((phase) => phase.id !== phaseId),
        order: prev.order.filter((id) => id !== phaseId),
        hiddenPhases: prev.hiddenPhases.filter((id) => id !== phaseId)
      };
    });
  }

  function addCustomPhase(title: string) {
    const clean = title.trim();
    if (!clean) return;
    setDraft((prev) => {
      const id = customPhaseId(clean, [...allPhases.map((phase) => phase.id), ...prev.customPhases.map((phase) => phase.id)]);
      return {
        ...prev,
        customPhases: [...prev.customPhases, { id, title: clean }],
        overrides: { ...prev.overrides, [id]: [] },
        windows: { ...prev.windows, [id]: { dueTime: CHECKLIST_DAY_END } },
        shifts: { ...prev.shifts, [id]: [] },
        order: [...prev.order, id]
      };
    });
    setNewPhaseTitle("");
  }

  function moveItemToPhase(phaseId: string, index: number, toPhaseId: string) {
    if (!toPhaseId || toPhaseId === phaseId) return;
    setDraft((prev) => ({ ...prev, overrides: moveChecklistItem(prev.overrides, { phaseId, index }, toPhaseId) }));
  }

  function moveItemWithin(phaseId: string, index: number, direction: -1 | 1) {
    setDraft((prev) => ({ ...prev, overrides: moveChecklistItemWithin(prev.overrides, phaseId, index, direction) }));
  }

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

  /** กะ2 time for a หัวข้อ both shifts do (เช่น นับ stock เช้า/เย็น). Cleared = ใช้เวลาเดียวกับกะ1. */
  function updateShift2Window(phaseId: string, field: "openTime" | "dueTime", value: string) {
    setDraft((prev) => {
      const current = prev.windows[phaseId] || { dueTime: CHECKLIST_DAY_END };
      const s2 = current.s2 || { dueTime: current.dueTime };
      const nextS2 = field === "dueTime" ? { ...s2, dueTime: value } : { ...s2, openTime: value || undefined };
      const cleared = !nextS2.dueTime;
      return { ...prev, windows: { ...prev.windows, [phaseId]: { ...current, s2: cleared ? undefined : nextS2 } } };
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
    const validWindow = (window: { openTime?: string; dueTime: string }) =>
      isHhMm(window.dueTime) && (window.openTime === undefined || window.openTime === "" || isHhMm(window.openTime));
    const badTime = Object.entries(draft.windows).find(
      ([, window]) => !validWindow(window) || (window.s2 !== undefined && !validWindow(window.s2))
    );
    if (badTime) {
      setStatus(`เวลาไม่ถูกต้องที่หัวข้อ ${badTime[0]} — ใช้รูปแบบ HH:MM`);
      return;
    }

    // A renamed หัวข้อ that was cleared back to blank should fall back to its built-in name.
    const titles = Object.fromEntries(
      Object.entries(draft.titles).filter(([, title]) => title.trim()).map(([phaseId, title]) => [phaseId, title.trim()])
    );
    const customPhases = draft.customPhases.filter((phase) => phase.title.trim()).map((phase) => ({ ...phase, title: (titles[phase.id] || phase.title).trim() }));

    setStatus("กำลังบันทึก…");
    try {
      await saveChecklistConfig({ branch, config: { ...draft, overrides, titles, customPhases }, updatedBy: editedBy });
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
          <section key={phase.id} className={`checklist-config__phase soft-card${isHidden(phase.id) ? " is-hidden" : ""}`}>
            <div className="checklist-config__phase-head">
              <input
                className="checklist-config__title"
                value={titleOf(phase)}
                onChange={(e) => renamePhase(phase.id, e.target.value)}
                aria-label="ชื่อหัวข้อใหญ่"
              />
              <div className="checklist-config__move">
                <button type="button" onClick={() => movePhase(phase.id, -1)} disabled={index === 0} aria-label="เลื่อนขึ้น">↑</button>
                <button type="button" onClick={() => movePhase(phase.id, 1)} disabled={index === orderedPhases.length - 1} aria-label="เลื่อนลง">↓</button>
                {isCustom(phase.id) ? (
                  <button type="button" onClick={() => removeCustomPhase(phase.id)} aria-label="ลบหัวข้อใหญ่">ลบ</button>
                ) : (
                  <button type="button" onClick={() => toggleHidden(phase.id)}>
                    {isHidden(phase.id) ? "เปิดใช้" : "ปิดหัวข้อนี้"}
                  </button>
                )}
              </div>
            </div>
            {isHidden(phase.id) ? <p className="checklist-config__hint">ปิดอยู่ — พนักงานไม่เห็นหัวข้อนี้ และไม่ถูกหักคะแนนจากมัน</p> : null}

            <div className="checklist-config__window">
              <label>
                กำหนดส่ง (สายกว่านี้หัก 2 คะแนน)
                <input type="time" value={window.dueTime} onChange={(e) => updateWindow(phase.id, "dueTime", e.target.value)} />
              </label>
              <label>
                เริ่มกดได้ตั้งแต่ (เว้นว่าง = กดได้ตลอดวัน)
                <input type="time" value={window.openTime || ""} onChange={(e) => updateWindow(phase.id, "openTime", e.target.value)} />
              </label>
              <label>
                กะ 2 · กำหนดส่ง (เว้นว่าง = ใช้เวลาเดียวกับกะ 1)
                <input type="time" value={window.s2?.dueTime || ""} onChange={(e) => updateShift2Window(phase.id, "dueTime", e.target.value)} />
              </label>
              <label>
                กะ 2 · เริ่มกดได้ตั้งแต่
                <input type="time" value={window.s2?.openTime || ""} onChange={(e) => updateShift2Window(phase.id, "openTime", e.target.value)} disabled={!window.s2?.dueTime} />
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
              {(draft.overrides[phase.id] ?? []).map((item, itemIndex, items) => (
                <li key={itemIndex}>
                  <input value={item} onChange={(e) => updateItem(phase.id, itemIndex, e.target.value)} placeholder="รายการ checklist" />
                  <div className="checklist-config__move">
                    <button type="button" onClick={() => moveItemWithin(phase.id, itemIndex, -1)} disabled={itemIndex === 0} aria-label="เลื่อนขึ้น">↑</button>
                    <button type="button" onClick={() => moveItemWithin(phase.id, itemIndex, 1)} disabled={itemIndex === items.length - 1} aria-label="เลื่อนลง">↓</button>
                  </div>
                  {/* ย้ายข้ามหัวข้อใหญ่: เลือกปลายทางแล้วรายการเด้งไปต่อท้ายหัวข้อนั้นทันที */}
                  <select
                    value=""
                    onChange={(e) => moveItemToPhase(phase.id, itemIndex, e.target.value)}
                    aria-label="ย้ายไปหัวข้ออื่น"
                  >
                    <option value="">ย้ายไป…</option>
                    {orderedPhases
                      .filter((target) => target.id !== phase.id)
                      .map((target) => (
                        <option key={target.id} value={target.id}>{titleOf(target)}</option>
                      ))}
                  </select>
                  <button type="button" onClick={() => removeItem(phase.id, itemIndex)} aria-label="ลบ">✕</button>
                </li>
              ))}
            </ul>
            <button type="button" className="checklist-config__add" onClick={() => addItem(phase.id)}>+ เพิ่มรายการ</button>
          </section>
        );
      })}

      <section className="checklist-config__phase soft-card">
        <div className="checklist-config__phase-head">
          <strong>เพิ่มหัวข้อใหญ่</strong>
        </div>
        <p className="checklist-config__hint">
          หัวข้อที่เพิ่มเองเป็นรายการติ๊กล้วนๆ (ไม่มีช่องกรอกรายละเอียดเฉพาะทางแบบหัวข้อเดิม) ·
          ตั้งเวลาส่งและกะได้เหมือนกัน · ย้ายรายการเดิมเข้ามาได้ด้วยปุ่ม &quot;ย้ายไป…&quot;
        </p>
        <div className="checklist-config__new-phase">
          <input
            value={newPhaseTitle}
            onChange={(e) => setNewPhaseTitle(e.target.value)}
            placeholder="ชื่อหัวข้อใหญ่ เช่น งานคลังหลังร้าน"
          />
          <button type="button" className="checklist-config__add" onClick={() => addCustomPhase(newPhaseTitle)}>+ เพิ่มหัวข้อ</button>
        </div>
      </section>

      <div className="checklist-config__bar">
        <button type="button" className="primary-action" onClick={save}>บันทึกทั้งหมด</button>
        {status ? <span className="checklist-config__status">{status}</span> : null}
      </div>
    </div>
  );
}
