"use client";

import { useEffect, useMemo, useState } from "react";
import {
  normalizeItemEvidence,
  normalizeOverrideItem,
  type ChecklistScope,
  type ChecklistOverrides,
  type EvidenceKind,
  type ItemEvidence,
  type OverrideItem,
  type UnitOverride
} from "../lib/checklist-overrides.ts";
import {
  fetchChecklistOverridesWithMeta,
  saveChecklistOverrides,
  type ChecklistOverridesMeta
} from "../lib/checklist-overrides-store.ts";
import { formatEditedAt } from "../lib/daily-checklist.ts";
import { firstInvalidLink, linkHostname, type ItemLink } from "../lib/checklist-links.ts";

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
  /**
   * allow the owner to require หลักฐาน (รูป/ลิงก์) per item — same control as the daily editor,
   * shown on every item (built-in and owner-added). Enabled only where the staff view renders +
   * enforces it (the stock checklists); left off for blocks whose staff view already captures
   * evidence its own way (events).
   */
  editEvidence?: boolean;
  /** built-in tick items, used as the starting point */
  baseItems: OverrideItem[];
};

type UnitDraft = { title: string; goal: string; timeLabel: string; shiftLabel: string; items: OverrideItem[] };

function sameLinks(a: ItemLink[] | undefined, b: ItemLink[] | undefined): boolean {
  const la = a || [];
  const lb = b || [];
  if (la.length !== lb.length) return false;
  return la.every((link, index) => link.label.trim() === lb[index].label.trim() && link.url.trim() === lb[index].url.trim());
}

function sameEvidence(a: ItemEvidence | undefined, b: ItemEvidence | undefined): boolean {
  const na = normalizeItemEvidence(a);
  const nb = normalizeItemEvidence(b);
  if (!na && !nb) return true;
  if (!na || !nb) return false;
  if ((na.note || "") !== (nb.note || "")) return false;
  return [...na.kinds].sort().join(",") === [...nb.kinds].sort().join(",");
}

function sameItems(a: OverrideItem[], b: OverrideItem[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (item, index) =>
      item.id === b[index].id &&
      item.title.trim() === b[index].title.trim() &&
      (item.note || "").trim() === (b[index].note || "").trim() &&
      sameLinks(item.links, b[index].links) &&
      sameEvidence(item.evidence, b[index].evidence)
  );
}

export function ChecklistItemsEditor({ scope, units }: { scope: ChecklistScope; units: EditableUnit[] }) {
  const [draft, setDraft] = useState<Record<string, UnitDraft>>({});
  const [meta, setMeta] = useState<ChecklistOverridesMeta>({ updatedAt: null, updatedBy: null });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  /** "แก้ไขล่าสุด ..." line — hidden until the scope has been saved at least once. */
  const editedAt = formatEditedAt(meta.updatedAt);

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
    fetchChecklistOverridesWithMeta(scope)
      .then((data) => {
        if (!alive) return;
        setDraft(seed(data.overrides));
        setMeta(data.meta);
      })
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

  /** Immutably patch one item's guide fields (note / links) in the draft. */
  function patchItem(unitId: string, index: number, patch: Partial<OverrideItem>) {
    setDraft((prev) => ({
      ...prev,
      [unitId]: {
        ...prev[unitId],
        items: prev[unitId].items.map((item, i) => (i === index ? { ...item, ...patch } : item))
      }
    }));
  }

  function updateItemNote(unitId: string, index: number, note: string) {
    patchItem(unitId, index, { note });
  }

  function addItemLink(unitId: string, index: number) {
    const links = [...(draft[unitId]?.items[index]?.links || []), { label: "", url: "" }];
    patchItem(unitId, index, { links });
  }

  function updateItemLink(unitId: string, index: number, linkIndex: number, field: keyof ItemLink, value: string) {
    const links = (draft[unitId]?.items[index]?.links || []).map((link, i) => (i === linkIndex ? { ...link, [field]: value } : link));
    patchItem(unitId, index, { links });
  }

  function removeItemLink(unitId: string, index: number, linkIndex: number) {
    const links = (draft[unitId]?.items[index]?.links || []).filter((_, i) => i !== linkIndex);
    patchItem(unitId, index, { links });
  }

  /** ตั้ง/ปิด ว่ารายการนี้ต้องแนบ รูป หรือ ลิงก์ — mirrors the daily editor's หลักฐาน control. */
  function toggleItemEvidenceKind(unitId: string, index: number, kind: EvidenceKind) {
    const current = draft[unitId]?.items[index]?.evidence;
    const kinds = current?.kinds || [];
    const nextKinds = kinds.includes(kind) ? kinds.filter((value) => value !== kind) : [...kinds, kind];
    patchItem(unitId, index, { evidence: nextKinds.length ? { kinds: nextKinds, note: current?.note } : undefined });
  }

  function updateItemEvidenceNote(unitId: string, index: number, note: string) {
    const current = draft[unitId]?.items[index]?.evidence;
    if (!current) return;
    patchItem(unitId, index, { evidence: { ...current, note } });
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
    // Refuse a bad link before persisting — a staffer must never tap a button that goes nowhere.
    for (const unit of units) {
      const d = draft[unit.id];
      if (!d) continue;
      for (const item of d.items) {
        const bad = firstInvalidLink(item.links);
        if (bad) {
          setStatus(`ลิงก์ไม่ถูกต้องที่รายการ "${item.title.trim() || unit.heading}" — ต้องขึ้นต้นด้วย https:// หรือ /`);
          return;
        }
      }
    }

    const overrides: ChecklistOverrides = {};
    for (const unit of units) {
      const d = draft[unit.id];
      if (!d) continue;
      const ov: UnitOverride = {};
      if (unit.editTitle && d.title.trim() && d.title.trim() !== (unit.baseTitle || "").trim()) ov.title = d.title.trim();
      if (unit.editGoal && d.goal.trim() && d.goal.trim() !== (unit.baseGoal || "").trim()) ov.goal = d.goal.trim();
      if (unit.editTime && d.timeLabel.trim() && d.timeLabel.trim() !== (unit.baseTimeLabel || "").trim()) ov.timeLabel = d.timeLabel.trim();
      if (unit.editShift && d.shiftLabel.trim() && d.shiftLabel.trim() !== (unit.baseShiftLabel || "").trim()) ov.shiftLabel = d.shiftLabel.trim();
      // normalizeOverrideItem trims the title and attaches the item's cleaned note + valid links.
      const cleanItems = d.items.map((item, index) => normalizeOverrideItem(item, index)).filter((item) => item.title);
      if (!sameItems(cleanItems, unit.baseItems)) ov.items = cleanItems;
      if (Object.keys(ov).length) overrides[unit.id] = ov;
    }

    setStatus("กำลังบันทึก…");
    try {
      const saved = await saveChecklistOverrides({ scope, overrides });
      // Reflect the server-stamped time/editor immediately so "แก้ไขล่าสุด" is current without a reload.
      setMeta({ updatedAt: saved.updatedAt ?? meta.updatedAt, updatedBy: saved.updatedBy ?? meta.updatedBy });
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
      <p className="checklist-config__edited">
        {editedAt ? (
          <>แก้ไขล่าสุด {editedAt}{meta.updatedBy ? ` · โดย ${meta.updatedBy}` : ""}</>
        ) : (
          "ยังไม่เคยบันทึก — แก้แล้วกดบันทึกทั้งหมด ระบบจะจำค่าล่าสุดไว้จนกว่าจะแก้ใหม่"
        )}
      </p>
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
              {d.items.map((item, index, items) => {
                const hasText = Boolean(item.title.trim());
                const links = item.links || [];
                const evidenceKinds = item.evidence?.kinds || [];
                // หลักฐานตั้งค่าได้ทุกรายการ (ทั้งรายการเดิมและที่เพิ่มเอง) เหมือนหน้า Daily —
                // เจ้าของเปิด/ปิด "ต้องส่งหลักฐาน" รายข้อได้เอง
                const showEvidence = Boolean(unit.editEvidence);
                return (
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
                  {/* หลักฐานที่บังคับให้พนักงานแนบตอนทำรายการนี้ (รูป/ลิงก์) — เหมือนหน้า Daily */}
                  {showEvidence ? (
                    <div className="checklist-config__evidence">
                      <span className="checklist-config__evidence-label">ต้องส่งหลักฐาน</span>
                      <label>
                        <input
                          type="checkbox"
                          checked={evidenceKinds.includes("photo")}
                          disabled={!hasText}
                          onChange={() => toggleItemEvidenceKind(unit.id, index, "photo")}
                        />
                        รูปภาพ
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={evidenceKinds.includes("link")}
                          disabled={!hasText}
                          onChange={() => toggleItemEvidenceKind(unit.id, index, "link")}
                        />
                        ลิงก์
                      </label>
                      {evidenceKinds.length ? (
                        <input
                          className="checklist-config__evidence-note"
                          value={item.evidence?.note || ""}
                          onChange={(e) => updateItemEvidenceNote(unit.id, index, e.target.value)}
                          placeholder="คำอธิบายหลักฐาน (ไม่บังคับ) เช่น รูปหลังนับ Stock เสร็จ"
                        />
                      ) : null}
                    </div>
                  ) : null}
                  {/* รายละเอียด + ปุ่มลิงก์ ที่ช่วยอธิบายรายการนี้ให้พนักงาน (ไม่บังคับ) */}
                  <div className="checklist-config__guide">
                    <span className="checklist-config__guide-label">รายละเอียด / ปุ่มลิงก์ (ไม่บังคับ)</span>
                    <textarea
                      className="checklist-config__guide-note"
                      rows={2}
                      value={item.note || ""}
                      disabled={!hasText}
                      onChange={(e) => updateItemNote(unit.id, index, e.target.value)}
                      placeholder="อธิบายว่าต้องทำอะไร / ทำยังไง"
                    />
                    {links.map((link, linkIndex) => (
                      <div key={linkIndex} className="checklist-config__guide-link">
                        <input
                          value={link.label}
                          disabled={!hasText}
                          onChange={(e) => updateItemLink(unit.id, index, linkIndex, "label", e.target.value)}
                          placeholder={`ชื่อปุ่ม (เว้นว่าง = ${linkHostname(link.url) || "ชื่อเว็บ"})`}
                          aria-label="ชื่อปุ่มลิงก์"
                        />
                        <input
                          value={link.url}
                          disabled={!hasText}
                          onChange={(e) => updateItemLink(unit.id, index, linkIndex, "url", e.target.value)}
                          placeholder="https://… หรือ /path ภายในเว็บ"
                          aria-label="ลิงก์ปลายทาง"
                          inputMode="url"
                        />
                        <button type="button" onClick={() => removeItemLink(unit.id, index, linkIndex)} aria-label="ลบลิงก์">✕</button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="checklist-config__guide-add"
                      disabled={!hasText}
                      onClick={() => addItemLink(unit.id, index)}
                    >
                      + เพิ่มปุ่มลิงก์
                    </button>
                  </div>
                </li>
                );
              })}
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
