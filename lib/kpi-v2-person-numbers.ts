import { taskMonth, taskState } from "./task-inbox.ts";
import { reviewEntriesFor } from "./project-review.ts";
import type { WorkProject } from "./work-projects.ts";
export type PersonNumbers = { advanced?: number; revenueOwn?: number };
export type PersonTargets = { teachTarget?: number; assignedOnTimeTarget?: number; memberTarget?: number; eventTarget?: number };
export type PersonNumberInput = { teachCount?: number; productSales?: number; productTarget?: number; members?: number; eventCustomers?: number; targets: PersonTargets; projects: WorkProject[] };
function achievement(value?: number, target?: number): number | undefined { if (value === undefined || !Number.isFinite(value) || target === undefined || !Number.isFinite(target) || target <= 0) return undefined; return Math.min(100, Math.max(0, value / target * 100)); }
export function personNumbers(staffCode: string, period: string, input: PersonNumberInput): PersonNumbers {
  const projects = input.projects.filter(p => p.assignees.includes(staffCode) && p.status !== "cancelled" && taskMonth(p) === period);
  const onTime = projects.filter(p => { const review = reviewEntriesFor(p, staffCode).slice(-1)[0]; return taskState(p, staffCode) === "passed" && Boolean(review?.submittedDate && review.dueDate && review.submittedDate <= review.dueDate); }).length;
  const advanced = [achievement(input.teachCount, input.targets.teachTarget), projects.length ? achievement(onTime / projects.length * 100, input.targets.assignedOnTimeTarget) : undefined].filter((n): n is number => n !== undefined);
  const revenue = [{ score: achievement(input.productSales, input.productTarget), weight: 2 }, { score: achievement(input.members, input.targets.memberTarget), weight: 1 }, { score: achievement(input.eventCustomers, input.targets.eventTarget), weight: 1 }].filter((m): m is { score: number; weight: number } => m.score !== undefined);
  return { ...(advanced.length ? { advanced: advanced.reduce((a, b) => a + b, 0) / advanced.length } : {}), ...(revenue.length ? { revenueOwn: revenue.reduce((a, b) => a + b.score * b.weight, 0) / revenue.reduce((a, b) => a + b.weight, 0) } : {}) };
}
