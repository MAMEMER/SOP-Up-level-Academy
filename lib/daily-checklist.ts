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
export type PhaseWindow = { openTime?: string; dueTime: string; s2?: { openTime?: string; dueTime: string } };
export type PhaseWindows = Record<string, PhaseWindow>;

/** Map of phaseId → the shift(s) that see it. An empty list means every shift. */
export type PhaseShifts = Record<string, ShiftCode[]>;

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
 * also set a กะ2 time.
 */
export function resolvePhaseWindow(
  phaseId: string,
  windows: PhaseWindows = {},
  shift?: "s1" | "s2" | null
): { openTime?: string; dueTime: string } {
  const configured = windows[phaseId];
  const fallback = defaultPhaseWindows[phaseId] || { dueTime: CHECKLIST_DAY_END };
  const source = configured && isHhMm(configured.dueTime) ? configured : fallback;
  const forShift = shift === "s2" && source.s2 && isHhMm(source.s2.dueTime) ? source.s2 : source;
  return {
    dueTime: isHhMm(forShift.dueTime) ? forShift.dueTime : CHECKLIST_DAY_END,
    openTime: isHhMm(forShift.openTime) ? forShift.openTime : undefined
  };
}

export type ChecklistConfig = {
  overrides: ChecklistOverrides;
  windows: PhaseWindows;
  /** phaseIds in the order the owner wants them shown */
  order: string[];
  shifts: PhaseShifts;
  /** long-form manual text per phase (rendered at /training) — see lib/work-manual.ts */
  manual: ManualOverrides;
};

export const emptyChecklistConfig: ChecklistConfig = { overrides: {}, windows: {}, order: [], shifts: {}, manual: {} };

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
  const withItems = applyChecklistOverrides(phases, config.overrides || {});
  const withShifts = applyPhaseShifts(withItems, config.shifts || {});
  return applyPhaseOrder(withShifts, config.order || []);
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

/** Seeds the editable window map so every phase shows a real time in the editor. */
export function seedWindowsFromPhases(phases: WorkflowPhase[], windows: PhaseWindows): PhaseWindows {
  const seeded: PhaseWindows = {};
  for (const phase of phases) seeded[phase.id] = resolvePhaseWindow(phase.id, windows);
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
