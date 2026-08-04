import type { WorkflowPhase, WorkflowSection } from "./card-store-workflow.ts";

// Owner-editable work manual (คู่มืองาน, rendered at /training).
//
// The manual is written in code (card-store-workflow.ts) because it is long-form and
// rarely changes. But "rarely" is not "never": when the routine changes, the owner had to
// wait for a deploy to fix the instructions the staff are scored against. These overrides
// let the manual be edited from /admin/manual-config, one entry per phase, and they live in
// the same branch doc as the checklist config (sop_daily_checklist) — no new collection,
// no rule change in the guild repo.

export type ManualOverride = {
  goal?: string;
  caution?: string;
  /** the "ขอบเขต / เวลา" line in the manual */
  timeLabel?: string;
  example?: string;
  sections?: WorkflowSection[];
};

export type ManualOverrides = Record<string, ManualOverride>;

function cleanSections(sections: WorkflowSection[] | undefined): WorkflowSection[] | undefined {
  if (!sections) return undefined;
  const cleaned = sections
    .map((section) => ({ title: section.title.trim(), tasks: section.tasks.map((task) => task.trim()).filter(Boolean) }))
    .filter((section) => section.title || section.tasks.length);
  return cleaned;
}

/** Applies the owner's manual edits. An untouched field keeps whatever the code says. */
export function applyManualOverrides(phases: WorkflowPhase[], overrides: ManualOverrides): WorkflowPhase[] {
  return phases.map((phase) => {
    const override = overrides[phase.id];
    if (!override) return phase;
    const sections = cleanSections(override.sections);
    return {
      ...phase,
      goal: override.goal?.trim() || phase.goal,
      caution: override.caution?.trim() || phase.caution,
      timeLabel: override.timeLabel?.trim() || phase.timeLabel,
      example: override.example?.trim() || phase.example,
      sections: sections && sections.length ? sections : phase.sections
    };
  });
}

/** Seeds the editor with the text that is live today, override or built-in. */
export function seedManualFromPhases(phases: WorkflowPhase[], overrides: ManualOverrides): ManualOverrides {
  const seeded: ManualOverrides = {};
  for (const phase of phases) {
    const override = overrides[phase.id] || {};
    seeded[phase.id] = {
      goal: override.goal ?? phase.goal,
      caution: override.caution ?? phase.caution,
      timeLabel: override.timeLabel ?? phase.timeLabel,
      example: override.example ?? phase.example ?? "",
      sections: (override.sections ?? phase.sections).map((section) => ({ title: section.title, tasks: [...section.tasks] }))
    };
  }
  return seeded;
}

/** Drops blank rows so an accidental empty line never reaches the staff manual. */
export function cleanManualOverrides(overrides: ManualOverrides): ManualOverrides {
  const cleaned: ManualOverrides = {};
  for (const [phaseId, override] of Object.entries(overrides)) {
    cleaned[phaseId] = {
      goal: (override.goal || "").trim(),
      caution: (override.caution || "").trim(),
      timeLabel: (override.timeLabel || "").trim(),
      example: (override.example || "").trim(),
      sections: cleanSections(override.sections) || []
    };
  }
  return cleaned;
}
