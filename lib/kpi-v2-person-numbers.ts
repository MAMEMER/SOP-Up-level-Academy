import { taskMonth, taskState } from "./task-inbox.ts";
import { reviewEntriesFor } from "./project-review.ts";
import type { WorkProject } from "./work-projects.ts";

export type PersonNumbers = { group12?: number; group22?: number };
export type PersonTargets = { teachTarget?: number; addonSalesTarget?: number; assignedOnTimeTarget?: number };
export type PersonNumberInput = {
  teachCount?: number;
  addonSales?: number;
  targets: PersonTargets;
  projects: WorkProject[];
};

function achievement(value: number | undefined, target: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || target === undefined || !Number.isFinite(target) || target <= 0) return undefined;
  return Math.min(100, Math.max(0, value / target * 100));
}

// TODO: Connect a verified referral source and its owner-set target when available.
export function referralAchievement(): undefined { return undefined; }

/** Projects use the same start-month folders and review state as the assigned-work inbox. */
export function personNumbers(staffCode: string, period: string, input: PersonNumberInput): PersonNumbers {
  const metrics = [achievement(input.teachCount, input.targets.teachTarget), achievement(input.addonSales, input.targets.addonSalesTarget), referralAchievement()]
    .filter((value): value is number => value !== undefined);
  const projects = input.projects.filter((project) => project.assignees.includes(staffCode) && project.status !== "cancelled" && taskMonth(project) === period);
  const onTime = projects.filter((project) => {
    if (taskState(project, staffCode) !== "passed") return false;
    const review = reviewEntriesFor(project, staffCode).slice(-1)[0];
    return Boolean(review && review.submittedDate && review.dueDate && review.submittedDate <= review.dueDate);
  }).length;
  const group22 = projects.length ? achievement(onTime / projects.length * 100, input.targets.assignedOnTimeTarget) : undefined;
  return {
    ...(metrics.length ? { group12: metrics.reduce((sum, value) => sum + value, 0) / metrics.length } : {}),
    ...(group22 !== undefined ? { group22 } : {})
  };
}
