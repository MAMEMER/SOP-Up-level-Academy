// Owner-editable daily checklist config. The base checklist for each phase lives in
// card-store-workflow.ts (code). The owner can tailor it per branch without a deploy:
// the items in a phase, the submit window of a phase, the order the phases appear in,
// and which shift each phase belongs to. Anything the owner has not touched keeps its
// built-in value (safe default).

import type { WorkflowPhase } from "./card-store-workflow.ts";
import type { ShiftCode } from "./shift-schedule.ts";
import type { ManualOverrides } from "./work-manual.ts";

/** Map of phaseId → replacement checklist items. */
export type ChecklistOverrides = Record<string, string[]>;

/**
 * The submit window of a หัวข้อ, in Bangkok clock time.
 *
 * `dueTime` is the deadline: submitting after it still works but costs 2 KPI points
 * (หมวด Checklist). `openTime` locks the หัวข้อ until that time — ปิดร้าน is the case that
 * needs it, so a closing checklist cannot be ticked off at noon. `s2` overrides both for
 * the closing shift, because a หัวข้อ shared by both กะ can be due at different times
 * (นับ stock: กะ1 ตอนเช้า, กะ2 ตอนเย็น).
 */
export type PhaseWindow = { openTime?: string; dueTime: string; s2?: { openTime?: string; dueTime?: string } };
export type PhaseWindows = Record<string, PhaseWindow>;

/** Map of phaseId → the shift(s) that see it. An empty list means every shift. */
export type PhaseShifts = Record<string, ShiftCode[]>;

/**
 * What proof a checklist item asks the staff to attach. A built-in หัวข้อ carries its own
 * detail panels (รูปเงินสด, เลข track ฯลฯ) in code; this lets the owner require หลักฐาน on
 * any item they add or edit at /admin/checklist-config — รูปภาพ และ/หรือ ลิงก์ — without a deploy.
 */
export type EvidenceKind = "photo" | "link";
export type ItemEvidence = { kinds: EvidenceKind[]; note?: string };

/**
 * phaseId → (ข้อความรายการ → หลักฐานที่ต้องแนบ). Keyed by the item text (not its index) so the
 * requirement follows the item when the owner reorders or moves it between หัวข้อ.
 */
export type ChecklistEvidence = Record<string, Record<string, ItemEvidence>>;

const EVIDENCE_KINDS: EvidenceKind[] = ["photo", "link"];

/** The requirement for one item, or undefined when it asks for nothing. */
export function evidenceForItem(
  evidence: ChecklistEvidence | undefined,
  phaseId: string,
  item: string
): ItemEvidence | undefined {
  const req = evidence?.[phaseId]?.[item.trim()];
  const kinds = (req?.kinds || []).filter((kind): kind is EvidenceKind => EVIDENCE_KINDS.includes(kind));
  if (!kinds.length) return undefined;
  return req?.note?.trim() ? { kinds, note: req.note.trim() } : { kinds };
}

/**
 * Drops evidence entries whose item text no longer exists in the phase (deleted/renamed) and
 * whose kind list is empty, so a saved config never keeps orphaned requirements. Run at save.
 */
export function pruneEvidence(evidence: ChecklistEvidence, overrides: ChecklistOverrides): ChecklistEvidence {
  const out: ChecklistEvidence = {};
  for (const [phaseId, byItem] of Object.entries(evidence || {})) {
    const items = new Set((overrides[phaseId] || []).map((item) => item.trim()).filter(Boolean));
    const kept: Record<string, ItemEvidence> = {};
    for (const [item, req] of Object.entries(byItem || {})) {
      const clean = item.trim();
      const resolved = evidenceForItem({ [phaseId]: { [clean]: req } }, phaseId, clean);
      if (clean && items.has(clean) && resolved) kept[clean] = resolved;
    }
    if (Object.keys(kept).length) out[phaseId] = kept;
  }
  return out;
}

/** Nothing may be submitted after the business day closes, whatever the หัวข้อ deadline is. */
export const CHECKLIST_DAY_END = "23:59";

/** Earliest a checklist can be touched at all (matches the workflow work-hours window). */
export const CHECKLIST_DAY_START = "09:00";

/**
 * Built-in windows for บางแค (ใบงาน fnpHvruMlF4Vvg7UvJUQ + TnkYKc7ha4Go07Az8m74), the same
 * every day — no weekday/weekend split, and no clock-in-relative window: every หัวข้อ shows
 * a fixed clock time the staff can read off the card, because late is a 2-point deduction.
 *   กะ1 เปิดร้าน + นับ stock                      : 09:00–13:00
 *   หลังเปิดร้าน (แชท/Exp ค้าง, จัดส่งสินค้า)      : 09:00–20:00
 *   กะ2 นับ stock                                 : 19:00–23:00
 *   กะ2 ปิดร้าน                                    : 19:00–23:59
 * The owner can change any of these at /admin/checklist-config.
 */
export const defaultPhaseWindows: PhaseWindows = {
  "open-store": { openTime: CHECKLIST_DAY_START, dueTime: "13:00" },
  "stock-work": { openTime: CHECKLIST_DAY_START, dueTime: "13:00", s2: { openTime: "19:00", dueTime: "23:00" } },
  "guild-chat-exp": { openTime: CHECKLIST_DAY_START, dueTime: "20:00" },
  "daytime-work": { openTime: CHECKLIST_DAY_START, dueTime: "20:00" },
  "close-store": { openTime: "19:00", dueTime: CHECKLIST_DAY_END }
};

export function isHhMm(value: string | undefined): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * The window a หัวข้อ runs on for this shift: owner override first, built-in second,
 * end-of-day last. An owner-set window replaces the built-in for both กะ unless the owner
 * also set a กะ2 time. The กะ2 (`s2`) block is a PARTIAL override: any field it leaves blank
 * inherits the กะ1 window (so the owner can set only a กะ2 start time and keep กะ1's deadline).
 */
export function resolvePhaseWindow(
  phaseId: string,
  windows: PhaseWindows = {},
  shift?: "s1" | "s2" | null
): { openTime?: string; dueTime: string } {
  const configured = windows[phaseId];
  const fallback = defaultPhaseWindows[phaseId] || { dueTime: CHECKLIST_DAY_END };
  const source = configured && isHhMm(configured.dueTime) ? configured : fallback;
  const base = {
    dueTime: isHhMm(source.dueTime) ? source.dueTime : CHECKLIST_DAY_END,
    openTime: isHhMm(source.openTime) ? source.openTime : undefined
  };
  if (shift === "s2" && source.s2) {
    return {
      dueTime: isHhMm(source.s2.dueTime) ? source.s2.dueTime : base.dueTime,
      openTime: isHhMm(source.s2.openTime) ? source.s2.openTime : base.openTime
    };
  }
  return base;
}

/**
 * A หัวข้อใหญ่ the owner created. The built-in ones live in card-store-workflow.ts with
 * their manual text and their per-item detail panels; a custom one is just a titled list
 * of ticks, which is what most new routines need.
 */
export type CustomPhase = {
  id: string;
  title: string;
  /** two-letter badge on the card */
  icon?: string;
  /** drives the card colour — same set the built-in phases use */
  category?: WorkflowPhase["category"];
  goal?: string;
};

export type ChecklistConfig = {
  overrides: ChecklistOverrides;
  windows: PhaseWindows;
  /** phaseIds in the order the owner wants them shown */
  order: string[];
  shifts: PhaseShifts;
  /** long-form manual text per phase (rendered at /training) — see lib/work-manual.ts */
  manual: ManualOverrides;
  /** หัวข้อใหญ่ the owner added */
  customPhases: CustomPhase[];
  /** built-in หัวข้อใหญ่ the owner switched off (they cannot be deleted from code) */
  hiddenPhases: string[];
  /** renamed หัวข้อใหญ่ — phaseId → new title */
  titles: Record<string, string>;
  /** หลักฐาน (รูป/ลิงก์) ที่แต่ละรายการบังคับให้แนบ — keyed by phaseId then item text */
  evidence: ChecklistEvidence;
};

export const emptyChecklistConfig: ChecklistConfig = {
  overrides: {},
  windows: {},
  order: [],
  shifts: {},
  manual: {},
  customPhases: [],
  hiddenPhases: [],
  titles: {},
  evidence: {}
};

/** Turns an owner-created หัวข้อ into the shape the checklist renders. */
export function customPhaseToWorkflowPhase(phase: CustomPhase, checklist: string[]): WorkflowPhase {
  return {
    id: phase.id,
    title: phase.title,
    timeLabel: "",
    category: phase.category || "online",
    icon: (phase.icon || phase.title.slice(0, 2)).toUpperCase(),
    goal: phase.goal || phase.title,
    caution: "",
    sections: [],
    checklist
  };
}

/**
 * Returns phases with their checklist replaced where an override exists. An empty
 * override array is respected (owner intentionally cleared a phase's items); a
 * missing phaseId falls back to the built-in checklist.
 */
export function applyChecklistOverrides(phases: WorkflowPhase[], overrides: ChecklistOverrides): WorkflowPhase[] {
  return phases.map((phase) =>
    Object.prototype.hasOwnProperty.call(overrides, phase.id)
      ? { ...phase, checklist: overrides[phase.id] }
      : phase
  );
}

/**
 * Reorders phases to the owner's order. Phases the order does not mention keep their
 * built-in position after the ones it does, so adding a phase in code never hides it.
 */
export function applyPhaseOrder(phases: WorkflowPhase[], order: string[]): WorkflowPhase[] {
  const ranked = order.filter((phaseId) => phases.some((phase) => phase.id === phaseId));
  const builtIn = new Map(phases.map((phase, index) => [phase.id, index]));
  return [...phases].sort((left, right) => {
    const leftIndex = ranked.indexOf(left.id);
    const rightIndex = ranked.indexOf(right.id);
    if (leftIndex === -1 && rightIndex === -1) return (builtIn.get(left.id) || 0) - (builtIn.get(right.id) || 0);
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });
}

/**
 * Applies the owner's shift assignment. An empty list means "ทุกกะ" — stored as `[]`,
 * rendered as an untagged phase, which is what phasesForShift() treats as shared.
 */
export function applyPhaseShifts(phases: WorkflowPhase[], shifts: PhaseShifts): WorkflowPhase[] {
  return phases.map((phase) => {
    if (!Object.prototype.hasOwnProperty.call(shifts, phase.id)) return phase;
    const assigned = shifts[phase.id].filter((shift) => shift === "s1" || shift === "s2");
    return { ...phase, shift: assigned.length ? assigned : undefined };
  });
}

/** Everything the owner configured, applied to the built-in phases in one call. */
export function applyChecklistConfig(phases: WorkflowPhase[], config: Partial<ChecklistConfig>): WorkflowPhase[] {
  const hidden = new Set(config.hiddenPhases || []);
  const titles = config.titles || {};
  const overrides = config.overrides || {};

  const builtIn = phases
    .filter((phase) => !hidden.has(phase.id))
    .map((phase) => (titles[phase.id]?.trim() ? { ...phase, title: titles[phase.id].trim() } : phase));

  // A custom หัวข้อ has no code behind it, so its items ARE its override entry.
  const custom = (config.customPhases || [])
    .filter((phase) => phase.id && phase.title && !hidden.has(phase.id))
    .map((phase) =>
      customPhaseToWorkflowPhase(
        titles[phase.id]?.trim() ? { ...phase, title: titles[phase.id].trim() } : phase,
        overrides[phase.id] || []
      )
    );

  const withItems = applyChecklistOverrides([...builtIn, ...custom], overrides);
  const withShifts = applyPhaseShifts(withItems, config.shifts || {});
  return applyPhaseOrder(withShifts, config.order || []);
}

/** A slug that is safe as a phaseId and as a Firestore map key. */
export function customPhaseId(title: string, existing: string[] = []): string {
  const base = `custom-${title.trim()}`.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9ก-๙-]/g, "").toLowerCase() || "custom-phase";
  if (!existing.includes(base)) return base;
  let suffix = 2;
  while (existing.includes(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

/**
 * Moves one item from one หัวข้อ to another. Both lists are rewritten, so the caller saves
 * the whole override map — this is what the "ย้ายไป" picker in the editor runs.
 */
export function moveChecklistItem(
  overrides: ChecklistOverrides,
  from: { phaseId: string; index: number },
  toPhaseId: string
): ChecklistOverrides {
  const source = overrides[from.phaseId] || [];
  const item = source[from.index];
  if (item === undefined || from.phaseId === toPhaseId) return overrides;
  return {
    ...overrides,
    [from.phaseId]: source.filter((_, index) => index !== from.index),
    [toPhaseId]: [...(overrides[toPhaseId] || []), item]
  };
}

/** Reorders one item inside its own หัวข้อ. */
export function moveChecklistItemWithin(overrides: ChecklistOverrides, phaseId: string, index: number, direction: -1 | 1): ChecklistOverrides {
  const items = [...(overrides[phaseId] || [])];
  const target = index + direction;
  if (target < 0 || target >= items.length) return overrides;
  [items[index], items[target]] = [items[target], items[index]];
  return { ...overrides, [phaseId]: items };
}

/** Seeds an editable override map from the built-in checklists (for the editor UI). */
export function seedOverridesFromPhases(phases: WorkflowPhase[], overrides: ChecklistOverrides): ChecklistOverrides {
  const seeded: ChecklistOverrides = {};
  for (const phase of phases) {
    seeded[phase.id] = Object.prototype.hasOwnProperty.call(overrides, phase.id)
      ? overrides[phase.id]
      : [...phase.checklist];
  }
  return seeded;
}

/**
 * The full window a หัวข้อ shows in the editor: owner override first, built-in second,
 * end-of-day last — but UNLIKE resolvePhaseWindow it keeps the กะ2 (`s2`) override intact
 * instead of flattening to one shift. The editor needs the whole window so an edit to the
 * กะ2 time round-trips (save → reload) instead of being dropped on every load.
 */
export function editablePhaseWindow(phaseId: string, windows: PhaseWindows = {}): PhaseWindow {
  const configured = windows[phaseId];
  const source = configured && isHhMm(configured.dueTime) ? configured : defaultPhaseWindows[phaseId] || { dueTime: CHECKLIST_DAY_END };
  const window: PhaseWindow = {
    dueTime: isHhMm(source.dueTime) ? source.dueTime : CHECKLIST_DAY_END,
    openTime: isHhMm(source.openTime) ? source.openTime : undefined
  };
  // Keep the กะ2 block if it carries EITHER time — an owner may set only a กะ2 start time and
  // leave the deadline blank ("ใช้เวลาเดียวกับกะ 1"). Dropping it on a blank dueTime is what
  // made กะ2 edits vanish on reload.
  if (source.s2 && (isHhMm(source.s2.dueTime) || isHhMm(source.s2.openTime))) {
    window.s2 = {
      dueTime: isHhMm(source.s2.dueTime) ? source.s2.dueTime : undefined,
      openTime: isHhMm(source.s2.openTime) ? source.s2.openTime : undefined
    };
  }
  return window;
}

/** Seeds the editable window map so every phase shows a real time in the editor. */
export function seedWindowsFromPhases(phases: WorkflowPhase[], windows: PhaseWindows): PhaseWindows {
  const seeded: PhaseWindows = {};
  for (const phase of phases) seeded[phase.id] = editablePhaseWindow(phase.id, windows);
  return seeded;
}

/** Seeds the editable shift map from whatever the phase is tagged with today. */
export function seedShiftsFromPhases(phases: WorkflowPhase[], shifts: PhaseShifts): PhaseShifts {
  const seeded: PhaseShifts = {};
  for (const phase of phases) {
    seeded[phase.id] = Object.prototype.hasOwnProperty.call(shifts, phase.id)
      ? shifts[phase.id]
      : [...(phase.shift || [])];
  }
  return seeded;
}
