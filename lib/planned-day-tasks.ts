// Turns the shift planner's per-day activities into the WORK tasks the staff dashboard
// must show — and keeps them on the dashboard until the team actually does them.
//
// The owner drops a Stock งานประจำ (Sleeve weekly / Single card monthly) onto the shift
// grid; it is stored as an activity on that day's `schedule_events` doc, sharing the
// `game` slot with game events (see planner-activities.ts). Anything whose key resolves
// to a TaskPreset is real work due on that date.
//
// Showing it ONLY on its exact date would be useless: Stock Sleeve planned for Monday
// would vanish from Tuesday's dashboard even though nobody counted anything. So a task
// stays due for its whole period — the ISO week for a weekly task, the calendar month
// for a monthly one — and reports how many days late it is. A task planned later in the
// current period is returned as "upcoming" so staff can see it coming.
//
// Pure (no Firestore / no DOM) so it can be unit-tested; the client hook does the fetch.

import { taskPreset, type TaskPreset } from "./planner-activities.ts";

/** The activity shape written by the planner (mirrors DayActivity in shift-schedule-store). */
export type PlannedActivity = { game?: string; time?: string; title?: string };

/** One day of the schedule grid. */
export type PlannedDay = { workDate: string; activities?: PlannedActivity[] };

export type PlannedDayTask = TaskPreset & {
  /** optional time chosen on the grid ("" for stock work, which has no fixed time) */
  time?: string;
};

export type DuePlannedTask = PlannedDayTask & {
  /** the date the owner planned it on (YYYY-MM-DD) */
  dueDate: string;
  /** 0 = due today, n > 0 = n days past its planned date, still unfinished */
  overdueDays: number;
  /** planned later in this period — show it, but don't nag yet */
  upcoming: boolean;
};

function parseDate(workDate: string): Date {
  const [year, month, day] = workDate.split("-").map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}

function toKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
}

/** Monday–Sunday bounds of the ISO week containing `workDate`. */
export function isoWeekBounds(workDate: string): { start: string; end: string } {
  const date = parseDate(workDate);
  const dayIndex = (date.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const start = new Date(date);
  start.setUTCDate(start.getUTCDate() - dayIndex);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start: toKey(start), end: toKey(end) };
}

/** First/last day of the calendar month containing `workDate`. */
export function monthBounds(workDate: string): { start: string; end: string } {
  const [year, month] = workDate.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: `${workDate.slice(0, 7)}-01`, end: `${workDate.slice(0, 7)}-${String(lastDay).padStart(2, "0")}` };
}

/** The period a task of this cadence is judged over, relative to `today`. */
export function periodBoundsFor(cadence: TaskPreset["cadence"], today: string): { start: string; end: string } {
  return cadence === "weekly" ? isoWeekBounds(today) : monthBounds(today);
}

/**
 * Work tasks planned for one day, in preset order, deduped by key. Game activities are
 * ignored — they already surface through the weekly-event cards.
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

/**
 * Stock work the team owes as of `today`, from the planned days of (at least) the current
 * week and month. One entry per task:
 *   - the most recent occurrence on or before today → due (overdueDays ≥ 0)
 *   - otherwise the next occurrence still inside the period → upcoming
 * Occurrences outside the task's own period are ignored: last week's Monday count is last
 * week's problem, this week starts clean.
 */
export function plannedTasksForPeriod(days: PlannedDay[], today: string): DuePlannedTask[] {
  const best = new Map<string, DuePlannedTask>();

  for (const day of days) {
    for (const task of plannedTasksFromActivities(day.activities)) {
      const bounds = periodBoundsFor(task.cadence, today);
      if (day.workDate < bounds.start || day.workDate > bounds.end) continue;

      const overdueDays = daysBetween(day.workDate, today);
      const candidate: DuePlannedTask = {
        ...task,
        dueDate: day.workDate,
        overdueDays: Math.max(overdueDays, 0),
        upcoming: overdueDays < 0
      };
      const current = best.get(task.key);
      if (!current) {
        best.set(task.key, candidate);
        continue;
      }
      // A date already reached always beats one that hasn't; among reached dates keep the
      // latest (that is the occurrence still owed), among future dates keep the soonest.
      const better = current.upcoming
        ? !candidate.upcoming || candidate.dueDate < current.dueDate
        : !candidate.upcoming && candidate.dueDate > current.dueDate;
      if (better) best.set(task.key, candidate);
    }
  }

  return [...best.values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** True when `href` is the checklist link of one of these tasks. */
export function isPlannedHref(tasks: { href: string }[], href: string): boolean {
  return tasks.some((task) => task.href === href);
}

/** The task (if any) a stock card's checklist link belongs to. */
export function plannedTaskForHref(tasks: DuePlannedTask[], href: string): DuePlannedTask | undefined {
  return tasks.find((task) => task.href === href);
}

/** Cadence label used on the dashboard card. */
export function plannedCadenceLabel(task: PlannedDayTask): string {
  return task.cadence === "weekly" ? "งานประจำสัปดาห์" : "งานประจำเดือน";
}

const THAI_WEEKDAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"] as const;
const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."] as const;

/** "จันทร์ 10 ส.ค." — the planned date, readable on a card. */
export function thaiDateLabel(workDate: string): string {
  const date = parseDate(workDate);
  const day = Number(workDate.slice(8, 10));
  return `${THAI_WEEKDAYS[date.getUTCDay()]} ${day} ${THAI_MONTHS[date.getUTCMonth()]}`;
}

/** Status line for a due task: today, late, or still ahead. */
export function plannedStatusText(task: DuePlannedTask, submitted: boolean): string {
  if (submitted) return `ส่งแล้ว · กำหนด ${thaiDateLabel(task.dueDate)}`;
  if (task.upcoming) return `กำหนด ${thaiDateLabel(task.dueDate)}`;
  if (task.overdueDays === 0) return `ถึงกำหนดวันนี้ · ${plannedCadenceLabel(task)}`;
  return `เลยกำหนด ${task.overdueDays} วัน · กำหนด ${thaiDateLabel(task.dueDate)}`;
}
