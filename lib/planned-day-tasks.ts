// Turns the shift planner's per-day activities into the WORK tasks the staff dashboard
// must show on that date.
//
// The owner drops a Stock งานประจำ (Sleeve weekly / Single card monthly) onto the shift
// grid; it is stored as an activity on the day's `schedule_events` doc, sharing the
// `game` slot with game events (see planner-activities.ts). Anything whose key resolves
// to a TaskPreset is real work due that day — the dashboard lists it as งานที่มอบหมาย so
// staff actually get it, instead of it living only on the schedule page.
//
// Pure (no Firestore / no DOM) so it can be unit-tested; the client hook does the fetch.

import { taskPreset, type TaskPreset } from "./planner-activities.ts";

/** The activity shape written by the planner (mirrors DayActivity in shift-schedule-store). */
export type PlannedActivity = { game?: string; time?: string; title?: string };

export type PlannedDayTask = TaskPreset & {
  /** optional time chosen on the grid ("" for stock work, which has no fixed time) */
  time?: string;
};

/**
 * Work tasks planned for one day, in preset order, deduped by key (the same task dropped
 * twice on a date is still one job). Game activities are ignored — they already surface
 * through the weekly-event cards.
 */
export function plannedTasksFromActivities(activities: PlannedActivity[] | undefined): PlannedDayTask[] {
  if (!activities?.length) return [];
  const seen = new Set<string>();
  const tasks: PlannedDayTask[] = [];
  for (const activity of activities) {
    const preset = taskPreset(activity.game);
    if (!preset || seen.has(preset.key)) continue;
    seen.add(preset.key);
    tasks.push({ ...preset, ...(activity.time ? { time: activity.time } : {}) });
  }
  return tasks;
}

/** True when `href` is the checklist link of a task planned for the day. */
export function isPlannedHref(tasks: PlannedDayTask[], href: string): boolean {
  return tasks.some((task) => task.href === href);
}

/** Cadence label used on the dashboard card. */
export function plannedCadenceLabel(task: PlannedDayTask): string {
  return task.cadence === "weekly" ? "งานประจำสัปดาห์" : "งานประจำเดือน";
}
