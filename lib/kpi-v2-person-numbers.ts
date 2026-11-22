import { skillIndicators, type CareerStage } from "./skill-indicators.ts";
import type { Position } from "./kpi-v2-score.ts";
import { taskMonth, taskState } from "./task-inbox.ts";
import { reviewEntriesFor } from "./project-review.ts";
import type { WorkProject } from "./work-projects.ts";
/** Skill levels count toward ด้าน 2 only after the owner approves the advanced skill set (5 skills from the Townhall deck). Until then the part is computed and shown to admins but excluded from the score. */
export const SKILL_PART_ENABLED = false;
export type PersonNumbers = { advanced?: number; sales?: number; members?: number; events?: number; skill?: { met: number; required: number } };
export type PersonTargets = { teachTarget?: number; assignedOnTimeTarget?: number; memberTarget?: number; eventTarget?: number };
export type PersonNumberInput = { teachCount?: number; productSales?: number; productTarget?: number; members?: number; eventCustomers?: number; targets: PersonTargets; projects: WorkProject[]; position?: Position; skillLevels?: Record<string, { level?: number }> };
function achievement(value?: number, target?: number): number | undefined { if (value === undefined || !Number.isFinite(value) || target === undefined || !Number.isFinite(target) || target <= 0) return undefined; return Math.min(100, Math.max(0, value / target * 100)); }
export function personNumbers(staffCode: string, period: string, input: PersonNumberInput): PersonNumbers {
  const projects = input.projects.filter(p => p.assignees.includes(staffCode) && p.status !== "cancelled" && taskMonth(p) === period);
  const onTime = projects.filter(p => { const review = reviewEntriesFor(p, staffCode).slice(-1)[0]; return taskState(p, staffCode) === "passed" && Boolean(review?.submittedDate && review.dueDate && review.submittedDate <= review.dueDate); }).length;
  const stage: CareerStage = input.position === "temporary" ? "parttime" : input.position === "branch_manager" ? "manager" : "regular";
  const required = skillIndicators.filter(indicator => indicator.group === "hard" && indicator.required[stage] > 0);
  const skill = input.skillLevels === undefined ? undefined : { met: required.filter(indicator => (input.skillLevels?.[indicator.id]?.level || 0) >= indicator.required[stage]).length, required: required.length };
  const advanced = [SKILL_PART_ENABLED && skill && skill.required ? skill.met / skill.required * 100 : undefined, achievement(input.teachCount, input.targets.teachTarget), projects.length ? achievement(onTime / projects.length * 100, input.targets.assignedOnTimeTarget) : undefined].filter((n): n is number => n !== undefined);
  const sales = achievement(input.productSales, input.productTarget);
  const members = achievement(input.members, input.targets.memberTarget);
  const events = achievement(input.eventCustomers, input.targets.eventTarget);
  return { ...(skill ? { skill } : {}), ...(advanced.length ? { advanced: advanced.reduce((a, b) => a + b, 0) / advanced.length } : {}), ...(sales !== undefined ? { sales } : {}), ...(members !== undefined ? { members } : {}), ...(events !== undefined ? { events } : {}) };
}
