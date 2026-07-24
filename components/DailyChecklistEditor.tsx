"use client";

import { useEffect, useState } from "react";
import type { WorkflowPhase } from "../lib/card-store-workflow.ts";
import { seedOverridesFromPhases, type ChecklistOverrides } from "../lib/daily-checklist.ts";
import { fetchChecklistOverrides, saveChecklistOverrides } from "../lib/daily-checklist-store.ts";
import { shiftLabel } from "../lib/shift-schedule.ts";

// Owner editor for the daily checklist. Loads the current overrides (or seeds from the
// built-in lists), lets the owner add / edit / remove items per phase, and saves the
// whole map back to Firestore. The staff checklist page picks the changes up on reload.
export function DailyChecklistEditor({
  phases,
  branch,
  editedBy
}: {
  phases: WorkflowPhase[];
  branch: string;
  editedBy: string;
}) {
  const [draft, setDraft] = useState<ChecklistOverrides>({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchChecklistOverrides(branch)
      .then((data) => alive && setDraft(seedOverridesFromPhases(phases, data)))
      .catch(() => alive && setDraft(seedOverridesFromPhases(phases, {})))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch]);

  function updateItem(phaseId: string, index: number, value: string) {
    setDraft((prev) => ({ ...prev, [phaseId]: prev[phaseId].map((item, i) => (i === index ? value : item)) }));
  }

  function addItem(phaseId: string) {
    setDraft((prev) => ({ ...prev, [phaseId]: [...prev[phaseId], ""] }));
  }

  function removeItem(phaseId: string, index: number) {
    setDraft((prev) => ({ ...prev, [phaseId]: prev[phaseId].filter((_, i) => i !== index) }));
  }

  async function save() {
    // Drop blank rows before persisting so accidental empties don't reach staff.
    const cleaned: ChecklistOverrides = {};
    for (const [phaseId, items] of Object.entries(draft)) {
      cleaned[phaseId] = items.map((s) => s.trim()).filter(Boolean);
    }
    setStatus("กำลังบันทึก…");
    try {
      await saveChecklistOverrides({ branch, overrides: cleaned, updatedBy: editedBy });
      setStatus("บันทึกแล้ว — checklist ของ staff อัปเดตแล้ว");
    } catch {
      setStatus("บันทึกไม่สำเร็จ");
    }
  }

  if (loading) return <p className="checklist-config__loading">กำลังโหลด…</p>;

  return (
    <div className="checklist-config">
      {phases.map((phase) => (
        <section key={phase.id} className="checklist-config__phase soft-card">
          <div className="checklist-config__phase-head">
            <strong>{phase.title}</strong>
            <span>{phase.shift ? phase.shift.map(shiftLabel).join(" · ") : "ทุกกะ"}</span>
          </div>
          <ul className="checklist-config__items">
            {(draft[phase.id] ?? []).map((item, index) => (
              <li key={index}>
                <input value={item} onChange={(e) => updateItem(phase.id, index, e.target.value)} placeholder="รายการ checklist" />
                <button type="button" onClick={() => removeItem(phase.id, index)} aria-label="ลบ">✕</button>
              </li>
            ))}
          </ul>
          <button type="button" className="checklist-config__add" onClick={() => addItem(phase.id)}>+ เพิ่มรายการ</button>
        </section>
      ))}

      <div className="checklist-config__bar">
        <button type="button" className="primary-action" onClick={save}>บันทึกทั้งหมด</button>
        {status ? <span className="checklist-config__status">{status}</span> : null}
      </div>
    </div>
  );
}
