// Owner-editable daily checklist overrides. The base checklist for each phase lives
// in card-store-workflow.ts (code). The owner can tailor the ticked items per phase
// without a deploy: an override doc holds, per phaseId, the replacement item list.
// A phase with no override keeps its built-in checklist (safe default).

import type { WorkflowPhase } from "./card-store-workflow.ts";

/** Map of phaseId → replacement checklist items. */
export type ChecklistOverrides = Record<string, string[]>;

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
