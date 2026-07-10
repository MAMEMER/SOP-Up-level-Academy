export type RunnerStep = {
  id?: string;
  step_order: number;
  checklist_items?: string[];
  duration_minutes?: number | null;
};

export type CheckedMap = Record<string, boolean>;

export function formatDuration(totalMinutes: number) {
  const totalSeconds = Math.max(0, Math.round(totalMinutes * 60));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = hours > 0 ? [hours, minutes, seconds] : [minutes, seconds];
  return parts.map((part) => String(part).padStart(2, "0")).join(":");
}

export function stepDurationMinutes(step: RunnerStep) {
  if (typeof step.duration_minutes === "number" && step.duration_minutes > 0) {
    return step.duration_minutes;
  }

  return 10;
}

export function countCompletedTasks(checked: CheckedMap) {
  return Object.values(checked).filter(Boolean).length;
}

export function checklistTaskKey(stepId: string, index: number) {
  return `${stepId}:${index}`;
}

export function isStepChecklistComplete(step: RunnerStep, checked: CheckedMap) {
  if (!step.id) return false;
  const items = step.checklist_items || [];
  return items.length > 0 && items.every((_, index) => Boolean(checked[checklistTaskKey(step.id!, index)]));
}

export function findNextStep<T extends RunnerStep>(steps: T[], currentStep: RunnerStep) {
  return steps.find((step) => step.step_order === currentStep.step_order + 1);
}
