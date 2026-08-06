"use client";

import { useEffect, useState } from "react";
import type { WorkflowPhase } from "../lib/card-store-workflow.ts";
import { applyChecklistConfig, emptyChecklistConfig, type ChecklistConfig } from "../lib/daily-checklist.ts";
import { fetchChecklistConfig, saveChecklistConfig } from "../lib/daily-checklist-store.ts";
import { cleanManualOverrides, seedManualFromPhases, type ManualOverrides } from "../lib/work-manual.ts";

// Owner editor for the work manual shown at /training. Loads whatever text is live today
// (override or built-in), lets the owner rewrite the objective, the caution, the scope
// line, the step sections and the example, then saves it into the branch config doc.

export function WorkManualEditor({
  phases,
  branch,
  editedBy
}: {
  phases: WorkflowPhase[];
  branch: string;
  editedBy: string;
}) {
  const [config, setConfig] = useState<ChecklistConfig>(emptyChecklistConfig);
  const [draft, setDraft] = useState<ManualOverrides>({});
  // The หัวข้อ list actually shown at /training: built-in phases + custom หัวข้อ the owner
  // added, minus hidden, titles applied. Seeded here so the owner can also write manual
  // text (วัตถุประสงค์ / ขั้นตอน / ระวัง) for a custom หัวข้อ, not just the built-in ones.
  const [manualPhases, setManualPhases] = useState<WorkflowPhase[]>(phases);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchChecklistConfig(branch)
      .then((data) => {
        if (!alive) return;
        const effective = applyChecklistConfig(phases, data);
        setConfig(data);
        setManualPhases(effective);
        setDraft(seedManualFromPhases(effective, data.manual));
      })
      .catch(() => {
        if (!alive) return;
        setConfig(emptyChecklistConfig);
        setManualPhases(phases);
        setDraft(seedManualFromPhases(phases, {}));
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch]);

  function updateField(phaseId: string, field: "goal" | "caution" | "timeLabel" | "example", value: string) {
    setDraft((prev) => ({ ...prev, [phaseId]: { ...prev[phaseId], [field]: value } }));
  }

  function updateSectionTitle(phaseId: string, index: number, value: string) {
    setDraft((prev) => ({
      ...prev,
      [phaseId]: {
        ...prev[phaseId],
        sections: (prev[phaseId]?.sections || []).map((section, i) => (i === index ? { ...section, title: value } : section))
      }
    }));
  }

  function updateTask(phaseId: string, sectionIndex: number, taskIndex: number, value: string) {
    setDraft((prev) => ({
      ...prev,
      [phaseId]: {
        ...prev[phaseId],
        sections: (prev[phaseId]?.sections || []).map((section, i) =>
          i === sectionIndex ? { ...section, tasks: section.tasks.map((task, t) => (t === taskIndex ? value : task)) } : section
        )
      }
    }));
  }

  function addTask(phaseId: string, sectionIndex: number) {
    setDraft((prev) => ({
      ...prev,
      [phaseId]: {
        ...prev[phaseId],
        sections: (prev[phaseId]?.sections || []).map((section, i) =>
          i === sectionIndex ? { ...section, tasks: [...section.tasks, ""] } : section
        )
      }
    }));
  }

  function removeTask(phaseId: string, sectionIndex: number, taskIndex: number) {
    setDraft((prev) => ({
      ...prev,
      [phaseId]: {
        ...prev[phaseId],
        sections: (prev[phaseId]?.sections || []).map((section, i) =>
          i === sectionIndex ? { ...section, tasks: section.tasks.filter((_, t) => t !== taskIndex) } : section
        )
      }
    }));
  }

  function addSection(phaseId: string) {
    setDraft((prev) => ({
      ...prev,
      [phaseId]: { ...prev[phaseId], sections: [...(prev[phaseId]?.sections || []), { title: "", tasks: [""] }] }
    }));
  }

  function removeSection(phaseId: string, index: number) {
    setDraft((prev) => ({
      ...prev,
      [phaseId]: { ...prev[phaseId], sections: (prev[phaseId]?.sections || []).filter((_, i) => i !== index) }
    }));
  }

  function moveSection(phaseId: string, index: number, direction: -1 | 1) {
    setDraft((prev) => {
      const sections = [...(prev[phaseId]?.sections || [])];
      const target = index + direction;
      if (target < 0 || target >= sections.length) return prev;
      [sections[index], sections[target]] = [sections[target], sections[index]];
      return { ...prev, [phaseId]: { ...prev[phaseId], sections } };
    });
  }

  async function save() {
    setStatus("กำลังบันทึก…");
    try {
      await saveChecklistConfig({
        branch,
        config: { ...config, manual: cleanManualOverrides(draft) },
        updatedBy: editedBy
      });
      setStatus("บันทึกแล้ว — คู่มือที่หน้า /training อัปเดตแล้ว");
    } catch {
      setStatus("บันทึกไม่สำเร็จ");
    }
  }

  if (loading) return <p className="checklist-config__loading">กำลังโหลด…</p>;

  return (
    <div className="checklist-config">
      {manualPhases.map((phase) => {
        const entry = draft[phase.id] || {};
        return (
          <section key={phase.id} className="checklist-config__phase soft-card">
            <div className="checklist-config__phase-head">
              <strong>{phase.title}</strong>
              <span>{phase.id}</span>
            </div>

            <div className="manual-config__fields">
              <label>
                วัตถุประสงค์
                <textarea rows={2} value={entry.goal || ""} onChange={(e) => updateField(phase.id, "goal", e.target.value)} />
              </label>
              <label>
                สิ่งที่ต้องระวัง
                <textarea rows={2} value={entry.caution || ""} onChange={(e) => updateField(phase.id, "caution", e.target.value)} />
              </label>
              <label>
                ขอบเขต / เวลา
                <input value={entry.timeLabel || ""} onChange={(e) => updateField(phase.id, "timeLabel", e.target.value)} />
              </label>
              <label>
                ตัวอย่าง (เว้นว่างได้)
                <textarea rows={3} value={entry.example || ""} onChange={(e) => updateField(phase.id, "example", e.target.value)} />
              </label>
            </div>

            <div className="manual-config__sections">
              <strong>ขั้นตอนการปฏิบัติงาน</strong>
              {(entry.sections || []).map((section, sectionIndex) => (
                <div key={sectionIndex} className="manual-config__section">
                  <div className="manual-config__section-head">
                    <input
                      value={section.title}
                      placeholder="ชื่อขั้นตอน"
                      onChange={(e) => updateSectionTitle(phase.id, sectionIndex, e.target.value)}
                    />
                    <div className="checklist-config__move">
                      <button type="button" onClick={() => moveSection(phase.id, sectionIndex, -1)} disabled={sectionIndex === 0} aria-label="เลื่อนขึ้น">↑</button>
                      <button type="button" onClick={() => moveSection(phase.id, sectionIndex, 1)} disabled={sectionIndex === (entry.sections || []).length - 1} aria-label="เลื่อนลง">↓</button>
                      <button type="button" onClick={() => removeSection(phase.id, sectionIndex)} aria-label="ลบขั้นตอน">✕</button>
                    </div>
                  </div>
                  <ul className="checklist-config__items">
                    {section.tasks.map((task, taskIndex) => (
                      <li key={taskIndex}>
                        <input value={task} placeholder="รายละเอียดงาน" onChange={(e) => updateTask(phase.id, sectionIndex, taskIndex, e.target.value)} />
                        <button type="button" onClick={() => removeTask(phase.id, sectionIndex, taskIndex)} aria-label="ลบ">✕</button>
                      </li>
                    ))}
                  </ul>
                  <button type="button" className="checklist-config__add" onClick={() => addTask(phase.id, sectionIndex)}>+ เพิ่มรายละเอียด</button>
                </div>
              ))}
              <button type="button" className="checklist-config__add" onClick={() => addSection(phase.id)}>+ เพิ่มขั้นตอน</button>
            </div>
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
