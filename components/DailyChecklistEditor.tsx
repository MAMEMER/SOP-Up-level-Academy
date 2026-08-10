"use client";

import { useEffect, useState } from "react";
import type { WorkflowPhase } from "../lib/card-store-workflow.ts";
import {
  CHECKLIST_DAY_END,
  customPhaseId,
  customPhaseToWorkflowPhase,
  emptyChecklistConfig,
  formatEditedAt,
  isHhMm,
  moveChecklistItem,
  moveChecklistItemWithin,
  pruneEvidence,
  pruneGuides,
  seedOverridesFromPhases,
  seedShiftsFromPhases,
  seedWindowsFromPhases,
  type ChecklistConfig,
  type EvidenceKind,
  type ItemEvidence,
  type ItemGuide
} from "../lib/daily-checklist.ts";
import { firstInvalidLink, linkHostname, type ItemLink } from "../lib/checklist-links.ts";
import { fetchChecklistConfigWithMeta, saveChecklistConfig, type ChecklistConfigMeta } from "../lib/daily-checklist-store.ts";
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
  const [meta, setMeta] = useState<ChecklistConfigMeta>({ updatedAt: null, updatedBy: null });
  const [newPhaseTitle, setNewPhaseTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchChecklistConfigWithMeta(branch)
      .then((data) => {
        if (!alive) return;
        setDraft(seedConfig(phases, data.config));
        setMeta({ updatedAt: data.updatedAt, updatedBy: data.updatedBy });
      })
      .catch(() => alive && setDraft(seedConfig(phases, emptyChecklistConfig)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch]);

  /** "แก้ไขล่าสุด ..." line — hidden until the config has been saved at least once. */
  const editedAt = formatEditedAt(meta.updatedAt);

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
      const { [phaseId]: _evidence, ...evidence } = prev.evidence;
      const { [phaseId]: _guides, ...guides } = prev.guides;
      return {
        ...prev,
        overrides,
        titles,
        windows,
        evidence,
        guides,
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

  /** Moves the หลักฐาน requirement for `item` between phases/items (or drops it when target is null). */
  function rekeyEvidence(
    evidence: ChecklistConfig["evidence"],
    from: { phaseId: string; item: string },
    to: { phaseId: string; item: string } | null
  ): ChecklistConfig["evidence"] {
    const fromItem = from.item.trim();
    const req = evidence[from.phaseId]?.[fromItem];
    if (!req) return evidence;
    const next: ChecklistConfig["evidence"] = { ...evidence };
    const fromPhase = { ...(next[from.phaseId] || {}) };
    delete fromPhase[fromItem];
    if (Object.keys(fromPhase).length) next[from.phaseId] = fromPhase;
    else delete next[from.phaseId];
    const toItem = to?.item.trim();
    if (to && toItem) next[to.phaseId] = { ...(next[to.phaseId] || {}), [toItem]: req };
    return next;
  }

  /** Same as rekeyEvidence, for the รายละเอียด/ลิงก์ guide attached to an item. */
  function rekeyGuides(
    guides: ChecklistConfig["guides"],
    from: { phaseId: string; item: string },
    to: { phaseId: string; item: string } | null
  ): ChecklistConfig["guides"] {
    const fromItem = from.item.trim();
    const guide = guides[from.phaseId]?.[fromItem];
    if (!guide) return guides;
    const next: ChecklistConfig["guides"] = { ...guides };
    const fromPhase = { ...(next[from.phaseId] || {}) };
    delete fromPhase[fromItem];
    if (Object.keys(fromPhase).length) next[from.phaseId] = fromPhase;
    else delete next[from.phaseId];
    const toItem = to?.item.trim();
    if (to && toItem) next[to.phaseId] = { ...(next[to.phaseId] || {}), [toItem]: guide };
    return next;
  }

  function moveItemToPhase(phaseId: string, index: number, toPhaseId: string) {
    if (!toPhaseId || toPhaseId === phaseId) return;
    setDraft((prev) => {
      const item = (prev.overrides[phaseId] || [])[index] ?? "";
      return {
        ...prev,
        overrides: moveChecklistItem(prev.overrides, { phaseId, index }, toPhaseId),
        evidence: rekeyEvidence(prev.evidence, { phaseId, item }, { phaseId: toPhaseId, item }),
        guides: rekeyGuides(prev.guides, { phaseId, item }, { phaseId: toPhaseId, item })
      };
    });
  }

  function moveItemWithin(phaseId: string, index: number, direction: -1 | 1) {
    setDraft((prev) => ({ ...prev, overrides: moveChecklistItemWithin(prev.overrides, phaseId, index, direction) }));
  }

  function updateItem(phaseId: string, index: number, value: string) {
    setDraft((prev) => {
      const previousText = (prev.overrides[phaseId] || [])[index] ?? "";
      return {
        ...prev,
        overrides: { ...prev.overrides, [phaseId]: (prev.overrides[phaseId] || []).map((item, i) => (i === index ? value : item)) },
        // Keep the หลักฐาน requirement attached to the item as its text is edited.
        evidence: previousText.trim() === value.trim()
          ? prev.evidence
          : rekeyEvidence(prev.evidence, { phaseId, item: previousText }, value.trim() ? { phaseId, item: value } : null),
        // Keep the รายละเอียด/ลิงก์ guide attached to the item as its text is edited.
        guides: previousText.trim() === value.trim()
          ? prev.guides
          : rekeyGuides(prev.guides, { phaseId, item: previousText }, value.trim() ? { phaseId, item: value } : null)
      };
    });
  }

  function addItem(phaseId: string) {
    setDraft((prev) => ({ ...prev, overrides: { ...prev.overrides, [phaseId]: [...(prev.overrides[phaseId] || []), ""] } }));
  }

  function removeItem(phaseId: string, index: number) {
    setDraft((prev) => {
      const item = (prev.overrides[phaseId] || [])[index] ?? "";
      return {
        ...prev,
        overrides: { ...prev.overrides, [phaseId]: (prev.overrides[phaseId] || []).filter((_, i) => i !== index) },
        evidence: rekeyEvidence(prev.evidence, { phaseId, item }, null),
        guides: rekeyGuides(prev.guides, { phaseId, item }, null)
      };
    });
  }

  function itemEvidence(phaseId: string, item: string): ItemEvidence | undefined {
    return draft.evidence[phaseId]?.[item.trim()];
  }

  function itemGuide(phaseId: string, item: string): ItemGuide | undefined {
    return draft.guides[phaseId]?.[item.trim()];
  }

  /** Immutably replace the guide for one item; a null next removes it (keeps the map clean). */
  function setGuide(phaseId: string, item: string, next: ItemGuide | null) {
    const key = item.trim();
    if (!key) return;
    setDraft((prev) => {
      const phaseMap = { ...(prev.guides[phaseId] || {}) };
      // Keep the entry only while it carries a note or at least one (even half-typed) link row —
      // clearing both drops it so an empty guide never lingers in the draft.
      const keep = Boolean(next && ((next.note && next.note.length) || (next.links && next.links.length)));
      if (keep && next) phaseMap[key] = next;
      else delete phaseMap[key];
      const guides = { ...prev.guides };
      if (Object.keys(phaseMap).length) guides[phaseId] = phaseMap;
      else delete guides[phaseId];
      return { ...prev, guides };
    });
  }

  function updateGuideNote(phaseId: string, item: string, note: string) {
    const current = itemGuide(phaseId, item);
    setGuide(phaseId, item, { note, links: current?.links });
  }

  function addGuideLink(phaseId: string, item: string) {
    const current = itemGuide(phaseId, item);
    setGuide(phaseId, item, { note: current?.note, links: [...(current?.links || []), { label: "", url: "" }] });
  }

  function updateGuideLink(phaseId: string, item: string, index: number, field: keyof ItemLink, value: string) {
    const current = itemGuide(phaseId, item);
    const links = (current?.links || []).map((link, i) => (i === index ? { ...link, [field]: value } : link));
    setGuide(phaseId, item, { note: current?.note, links });
  }

  function removeGuideLink(phaseId: string, item: string, index: number) {
    const current = itemGuide(phaseId, item);
    const links = (current?.links || []).filter((_, i) => i !== index);
    setGuide(phaseId, item, { note: current?.note, links });
  }

  /** ตั้ง/ปิด ว่ารายการนี้ต้องแนบ รูป หรือ ลิงก์. เก็บ requirement โดย key ด้วยข้อความรายการ. */
  function toggleEvidenceKind(phaseId: string, item: string, kind: EvidenceKind) {
    const key = item.trim();
    if (!key) return;
    setDraft((prev) => {
      const current = prev.evidence[phaseId]?.[key];
      const kinds = current?.kinds || [];
      const nextKinds = kinds.includes(kind) ? kinds.filter((value) => value !== kind) : [...kinds, kind];
      const phaseMap = { ...(prev.evidence[phaseId] || {}) };
      if (nextKinds.length) phaseMap[key] = { ...current, kinds: nextKinds };
      else delete phaseMap[key];
      const evidence = { ...prev.evidence };
      if (Object.keys(phaseMap).length) evidence[phaseId] = phaseMap;
      else delete evidence[phaseId];
      return { ...prev, evidence };
    });
  }

  function updateEvidenceNote(phaseId: string, item: string, note: string) {
    const key = item.trim();
    if (!key) return;
    setDraft((prev) => {
      const current = prev.evidence[phaseId]?.[key];
      if (!current) return prev;
      const phaseMap = { ...(prev.evidence[phaseId] || {}), [key]: { ...current, note } };
      return { ...prev, evidence: { ...prev.evidence, [phaseId]: phaseMap } };
    });
  }

  function updateWindow(phaseId: string, field: "openTime" | "dueTime", value: string) {
    setDraft((prev) => {
      const current = prev.windows[phaseId] || { dueTime: CHECKLIST_DAY_END };
      const next = field === "dueTime" ? { ...current, dueTime: value } : { ...current, openTime: value || undefined };
      return { ...prev, windows: { ...prev.windows, [phaseId]: next } };
    });
  }

  /**
   * กะ2 time for a หัวข้อ both shifts do (เช่น นับ stock เช้า/เย็น). The กะ2 block is a partial
   * override: a blank field inherits กะ1, so the owner can set only a start time (เริ่มกดได้)
   * and leave the deadline blank. The block is cleared only when BOTH fields are empty.
   */
  function updateShift2Window(phaseId: string, field: "openTime" | "dueTime", value: string) {
    setDraft((prev) => {
      const current = prev.windows[phaseId] || { dueTime: CHECKLIST_DAY_END };
      const s2 = current.s2 || {};
      const nextS2 = field === "dueTime" ? { ...s2, dueTime: value || undefined } : { ...s2, openTime: value || undefined };
      const cleared = !nextS2.dueTime && !nextS2.openTime;
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
    const okTime = (value: string | undefined) => value === undefined || value === "" || isHhMm(value);
    const validWindow = (window: { openTime?: string; dueTime: string }) => isHhMm(window.dueTime) && okTime(window.openTime);
    // กะ2 is a partial override — a blank dueTime is valid (inherits กะ1), so only reject a
    // malformed time, not an empty one.
    const validShift2 = (window: { openTime?: string; dueTime?: string }) => okTime(window.dueTime) && okTime(window.openTime);
    const badTime = Object.entries(draft.windows).find(
      ([, window]) => !validWindow(window) || (window.s2 !== undefined && !validShift2(window.s2))
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

    // Evidence is keyed by item text — drop any requirement whose item was deleted or blanked.
    const evidence = pruneEvidence(draft.evidence, overrides);

    // Refuse a bad link before persisting — a staffer must never tap a button that goes nowhere.
    for (const [phaseId, byItem] of Object.entries(draft.guides)) {
      for (const [item, guide] of Object.entries(byItem)) {
        const bad = firstInvalidLink(guide.links);
        if (bad) {
          setStatus(`ลิงก์ไม่ถูกต้องที่รายการ "${item.trim() || phaseId}" — ต้องขึ้นต้นด้วย https:// หรือ /`);
          return;
        }
      }
    }
    // Guides are keyed by item text too — drop any guide whose item was deleted or blanked.
    const guides = pruneGuides(draft.guides, overrides);

    setStatus("กำลังบันทึก…");
    try {
      const saved = await saveChecklistConfig({ branch, config: { ...draft, overrides, titles, customPhases, evidence, guides }, updatedBy: editedBy });
      // Reflect the server-stamped time/editor immediately so the "แก้ไขล่าสุด" line is
      // current without a reload (fallback to editedBy if the route returned no meta).
      setMeta({ updatedAt: saved.updatedAt ?? meta.updatedAt, updatedBy: saved.updatedBy ?? editedBy });
      setStatus("บันทึกแล้ว — checklist ของ staff อัปเดตแล้ว");
    } catch {
      setStatus("บันทึกไม่สำเร็จ");
    }
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
                กะ 2 · เริ่มกดได้ตั้งแต่ (เว้นว่าง = เหมือนกะ 1)
                <input type="time" value={window.s2?.openTime || ""} onChange={(e) => updateShift2Window(phase.id, "openTime", e.target.value)} />
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
              {(draft.overrides[phase.id] ?? []).map((item, itemIndex, items) => {
                const evidence = itemEvidence(phase.id, item);
                const kinds = evidence?.kinds || [];
                const hasText = Boolean(item.trim());
                const guide = itemGuide(phase.id, item);
                const guideLinks = guide?.links || [];
                return (
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
                  {/* หลักฐานที่บังคับให้พนักงานแนบตอนทำรายการนี้ (รูป/ลิงก์) */}
                  <div className="checklist-config__evidence">
                    <span className="checklist-config__evidence-label">ต้องส่งหลักฐาน</span>
                    <label>
                      <input
                        type="checkbox"
                        checked={kinds.includes("photo")}
                        disabled={!hasText}
                        onChange={() => toggleEvidenceKind(phase.id, item, "photo")}
                      />
                      รูปภาพ
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={kinds.includes("link")}
                        disabled={!hasText}
                        onChange={() => toggleEvidenceKind(phase.id, item, "link")}
                      />
                      ลิงก์
                    </label>
                    {kinds.length ? (
                      <input
                        className="checklist-config__evidence-note"
                        value={evidence?.note || ""}
                        onChange={(e) => updateEvidenceNote(phase.id, item, e.target.value)}
                        placeholder="คำอธิบายหลักฐาน (ไม่บังคับ) เช่น รูปโพสต์กิจกรรม"
                      />
                    ) : null}
                  </div>
                  {/* รายละเอียด + ปุ่มลิงก์ ที่ช่วยอธิบายรายการนี้ให้พนักงาน (ไม่บังคับ) */}
                  <div className="checklist-config__guide">
                    <span className="checklist-config__guide-label">รายละเอียด / ปุ่มลิงก์ (ไม่บังคับ)</span>
                    <textarea
                      className="checklist-config__guide-note"
                      rows={2}
                      value={guide?.note || ""}
                      disabled={!hasText}
                      onChange={(e) => updateGuideNote(phase.id, item, e.target.value)}
                      placeholder="อธิบายว่าต้องทำอะไร / ทำยังไง เช่น เช็คยอดใน StoreHub ก่อนเปิดร้าน"
                    />
                    {guideLinks.map((link, linkIndex) => (
                      <div key={linkIndex} className="checklist-config__guide-link">
                        <input
                          value={link.label}
                          disabled={!hasText}
                          onChange={(e) => updateGuideLink(phase.id, item, linkIndex, "label", e.target.value)}
                          placeholder={`ชื่อปุ่ม (เว้นว่าง = ${linkHostname(link.url) || "ชื่อเว็บ"})`}
                          aria-label="ชื่อปุ่มลิงก์"
                        />
                        <input
                          value={link.url}
                          disabled={!hasText}
                          onChange={(e) => updateGuideLink(phase.id, item, linkIndex, "url", e.target.value)}
                          placeholder="https://… หรือ /path ภายในเว็บ"
                          aria-label="ลิงก์ปลายทาง"
                          inputMode="url"
                        />
                        <button type="button" onClick={() => removeGuideLink(phase.id, item, linkIndex)} aria-label="ลบลิงก์">✕</button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="checklist-config__guide-add"
                      disabled={!hasText}
                      onClick={() => addGuideLink(phase.id, item)}
                    >
                      + เพิ่มปุ่มลิงก์
                    </button>
                  </div>
                </li>
                );
              })}
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
          หัวข้อที่เพิ่มเองเป็นรายการติ๊ก · ตั้งให้แต่ละรายการต้องแนบหลักฐาน (รูปภาพ/ลิงก์) ได้ที่ช่อง &quot;ต้องส่งหลักฐาน&quot; ใต้รายการ ·
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
