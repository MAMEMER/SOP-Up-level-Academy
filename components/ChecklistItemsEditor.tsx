"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type ChecklistScope,
  type ChecklistOverrides,
  type OverrideItem,
  type UnitOverride
} from "../lib/checklist-overrides.ts";
import { fetchChecklistOverrides, saveChecklistOverrides } from "../lib/checklist-overrides-store.ts";

// Owner editor for a WEEKLY or MONTHLY checklist scope. Simpler sibling of DailyChecklistEditor:
// it edits the tick items (add / reword / delete / reorder) of each block, plus the block title
// and goal where that makes sense. Reuses the daily editor's CSS so it matches the theme. Saves
// the whole scope back to Firestore; the staff checklist page picks the changes up on reload.

/** One editable checklist block on the page (a stock phase, or one event's checklist). */
export type EditableUnit = {
  id: string;
  /** fixed label above the block (e.g. the event name) */
  heading: string;
  /** optional guidance under the heading */
  note?: string;
  /** allow renaming the block's หัวข้อ title */
  editTitle?: boolean;
  baseTitle?: string;
  /** allow editing the goal / description line */
  editGoal?: boolean;
  goalLabel?: string;
  baseGoal?: string;
  /** allow editing เวลา (free-text time label shown on the staff card) */
  editTime?: boolean;
  timeLabel?: string;
  baseTimeLabel?: string;
  /** allow editing กะที่รับผิดชอบ (free-text shift label) */
  editShift?: boolean;
  baseShiftLabel?: string;
  /** built-in tick items, used as the starting point */
  baseItems: OverrideItem[];
};

type UnitDraft = { title: string; goal: string; timeLabel: string; shiftLabel: string; items: OverrideItem[] };

function sameItems(a: OverrideItem[], b: OverrideItem[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item.id === b[index].id && item.title.trim() === b[index].title.trim());
}

export function ChecklistItemsEditor({ scope, units }: { scope: ChecklistScope; units: EditableUnit[] }) {
  const [draft, setDraft] = useState<Record<string, UnitDraft>>({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const seed = useMemo(() => {
    return (overrides: ChecklistOverrides): Record<string, UnitDraft> => {
      const out: Record<string, UnitDraft> = {};
      for (const unit of units) {
        const ov = overrides[unit.id] || {};
        out[unit.id] = {
          title: ov.title ?? unit.baseTitle ?? "",
          goal: ov.goal ?? unit.baseGoal ?? "",
          timeLabel: ov.timeLabel ?? unit.baseTimeLabel ?? "",
          shiftLabel: ov.shiftLabel ?? unit.baseShiftLabel ?? "",
          items: (ov.items ?? unit.baseItems).map((item) => ({ ...item }))
        };
      }
      return out;
    };
  }, [units]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchChecklistOverrides(scope)
      .then((data) => alive && setDraft(seed(data)))
      .catch(() => alive && setDraft(seed({})))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [scope, seed]);

  function updateUnit(unitId: string, patch: Partial<UnitDraft>) {
    setDraft((prev) => ({ ...prev, [unitId]: { ...prev[unitId], ...patch } }));
  }

  function updateItem(unitId: string, index: number, value: string) {
    setDraft((prev) => ({
      ...prev,
      [unitId]: {
        ...prev[unitId],
        items: prev[unitId].items.map((item, i) => (i === index ? { ...item, title: value } : item))
      }
    }));
  }

  function moveItem(unitId: string, index: number, direction: -1 | 1) {
    setDraft((prev) => {
      const items = [...prev[unitId].items];
      const target = index + direction;
      if (target < 0 || target >= items.length) return prev;
      [items[index], items[target]] = [items[target], items[index]];
      return { ...prev, [unitId]: { ...prev[unitId], items } };
    });
  }

  function removeItem(unitId: string, index: number) {
    setDraft((prev) => ({
      ...prev,
      [unitId]: { ...prev[unitId], items: prev[unitId].items.filter((_, i) => i !== index) }
    }));
  }

  function addItem(unitId: string) {
    setDraft((prev) => {
      const existing = new Set(prev[unitId].items.map((item) => item.id));
      let n = existing.size + 1;
      while (existing.has(`custom-${n}`)) n += 1;
      return { ...prev, [unitId]: { ...prev[unitId], items: [...prev[unitId].items, { id: `custom-${n}`, title: "" }] } };
    });
  }

  async function save() {
    // Persist only what the owner actually changed, so an untouched block keeps falling back to
    // its built-in value (and future edits in code still reach staff).
    const overrides: ChecklistOverrides = {};
    for (const unit of units) {
      const d = draft[unit.id];
      if (!d) continue;
      const ov: UnitOverride = {};
      if (unit.editTitle && d.title.trim() && d.title.trim() !== (unit.baseTitle || "").trim()) ov.title = d.title.trim();
      if (unit.editGoal && d.goal.trim() && d.goal.trim() !== (unit.baseGoal || "").trim()) ov.goal = d.goal.trim();
      if (unit.editTime && d.timeLabel.trim() && d.timeLabel.trim() !== (unit.baseTimeLabel || "").trim()) ov.timeLabel = d.timeLabel.trim();
      if (unit.editShift && d.shiftLabel.trim() && d.shiftLabel.trim() !== (unit.baseShiftLabel || "").trim()) ov.shiftLabel = d.shiftLabel.trim();
      const cleanItems = d.items.map((item) => ({ id: item.id, title: item.title.trim() })).filter((item) => item.title);
      if (!sameItems(cleanItems, unit.baseItems)) ov.items = cleanItems;
      if (Object.keys(ov).length) overrides[unit.id] = ov;
    }

    setStatus("กำลังบันทึก…");
    try {
      await saveChecklistOverrides({ scope, overrides });
      setStatus("บันทึกแล้ว — checklist ของ staff อัปเดตแล้ว");
    } catch {
      setStatus("บันทึกไม่สำเร็จ");
    }
  }

  function resetUnit(unitId: string) {
    const unit = units.find((item) => item.id === unitId);
    if (!unit) return;
    updateUnit(unitId, {
      title: unit.baseTitle ?? "",
      goal: unit.baseGoal ?? "",
      timeLabel: unit.baseTimeLabel ?? "",
      shiftLabel: unit.baseShiftLabel ?? "",
      items: unit.baseItems.map((item) => ({ ...item }))
    });
  }

  if (loading) return <p className="checklist-config__loading">กำลังโหลด…</p>;

  return (
    <div className="checklist-config">
      {units.map((unit) => {
        const d = draft[unit.id];
        if (!d) return null;
        return (
          <section key={unit.id} className="checklist-config__phase soft-card">
            <div className="checklist-config__phase-head">
              <strong>{unit.heading}</strong>
              <div className="checklist-config__move">
                <button type="button" onClick={() => resetUnit(unit.id)}>คืนค่าเริ่มต้น</button>
              </div>
            </div>
            {unit.note ? <p className="checklist-config__hint">{unit.note}</p> : null}

            {unit.editTitle ? (
              <input
                className="checklist-config__title"
                value={d.title}
                onChange={(e) => updateUnit(unit.id, { title: e.target.value })}
                aria-label="ชื่อหัวข้อ"
                placeholder="ชื่อหัวข้อ"
              />
            ) : null}
            {unit.editGoal ? (
              <label className="checklist-config__goal">
                {unit.goalLabel || "รายละเอียด"}
                <textarea value={d.goal} onChange={(e) => updateUnit(unit.id, { goal: e.target.value })} rows={2} />
              </label>
            ) : null}

            {unit.editTime || unit.editShift ? (
              <div className="checklist-config__window">
                {unit.editTime ? (
                  <label>
                    {unit.timeLabel || "เวลา"}
                    <input
                      type="text"
                      value={d.timeLabel}
                      onChange={(e) => updateUnit(unit.id, { timeLabel: e.target.value })}
                      placeholder="เช่น งานประจำสัปดาห์ · ตามเวลาเปิด-ปิดร้าน"
                    />
                  </label>
                ) : null}
                {unit.editShift ? (
                  <label>
                    กะที่รับผิดชอบ
                    <input
                      type="text"
                      value={d.shiftLabel}
                      onChange={(e) => updateUnit(unit.id, { shiftLabel: e.target.value })}
                      placeholder="เช่น กะ 1, กะ 2, ทุกกะ"
                    />
                  </label>
                ) : null}
              </div>
            ) : null}

            <ul className="checklist-config__items">
              {d.items.map((item, index, items) => (
                <li key={item.id}>
                  <input
                    value={item.title}
                    onChange={(e) => updateItem(unit.id, index, e.target.value)}
                    placeholder="รายการ checklist"
                  />
                  <div className="checklist-config__move">
                    <button type="button" onClick={() => moveItem(unit.id, index, -1)} disabled={index === 0} aria-label="เลื่อนขึ้น">↑</button>
                    <button type="button" onClick={() => moveItem(unit.id, index, 1)} disabled={index === items.length - 1} aria-label="เลื่อนลง">↓</button>
                  </div>
                  <button type="button" onClick={() => removeItem(unit.id, index)} aria-label="ลบ">✕</button>
                </li>
              ))}
            </ul>
            <button type="button" className="checklist-config__add" onClick={() => addItem(unit.id)}>+ เพิ่มรายการ</button>
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
