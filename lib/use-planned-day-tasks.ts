"use client";

import { useEffect, useState } from "react";
import { isoWeekKey } from "./periodic-tasks.ts";
import {
  isoWeekBounds,
  monthBounds,
  plannedTasksForPeriod,
  type DuePlannedTask
} from "./planned-day-tasks.ts";
import { fetchDayEventsForMonths } from "./shift-schedule-store.ts";
import { fetchWorkRecordRange } from "./work-records-client.ts";
import { weeklyScopeKey } from "./work-records.ts";

export type PlannedStockWork = {
  /** every Stock task owed this period (due or upcoming), earliest planned date first */
  tasks: DuePlannedTask[];
  /** task key → the team already submitted its checklist for this period */
  submitted: Record<string, boolean>;
};

const EMPTY: PlannedStockWork = { tasks: [], submitted: {} };

/**
 * Stock งานประจำ the owner planned on the shift grid, resolved against today: a task
 * planned earlier this week/month is still owed until the team submits its checklist.
 *
 * The schedule is read with the same Firebase client the planner writes with (the
 * dashboard can't rely on admin credentials being present); submissions come from the
 * work-records API (team-owned records, keyed by ISO week for both checklists). Both
 * fail soft to empty so a missing schedule never blanks the dashboard.
 */
export function usePlannedStockWork(branch: string | undefined, workDate: string): PlannedStockWork {
  const [state, setState] = useState<PlannedStockWork>(EMPTY);

  useEffect(() => {
    if (!branch) {
      setState(EMPTY);
      return;
    }
    let alive = true;

    // An ISO week can straddle two months, so load every month the current week or month
    // touches — one indexed query each.
    const week = isoWeekBounds(workDate);
    const month = monthBounds(workDate);
    const months = [week.start, week.end, month.start].map((date) => date.slice(0, 7));

    fetchDayEventsForMonths(branch, months)
      .then((events) => {
        if (!alive) return;
        setState((previous) => ({
          ...previous,
          tasks: plannedTasksForPeriod(
            events.map((event) => ({ workDate: event.workDate, activities: event.activities })),
            workDate
          )
        }));
      })
      .catch(() => alive && setState((previous) => ({ ...previous, tasks: [] })));

    // Both stock checklists key their team record by ISO week.
    const scopeKey = weeklyScopeKey(isoWeekKey(workDate));
    Promise.all([
      fetchWorkRecordRange("weekly", scopeKey, scopeKey, { owner: "team" }),
      fetchWorkRecordRange("monthly", scopeKey, scopeKey, { owner: "team" })
    ])
      .then(([weekly, monthly]) => {
        if (!alive) return;
        const submittedIn = (records: { data?: Record<string, unknown> }[]) =>
          records.some((record) => Boolean(record.data?.submittedAt));
        setState((previous) => ({
          ...previous,
          submitted: {
            "stock-sleeve-work": submittedIn(weekly.records),
            "stock-single-card-work": submittedIn(monthly.records)
          }
        }));
      })
      .catch(() => alive && setState((previous) => ({ ...previous, submitted: {} })));

    return () => {
      alive = false;
    };
  }, [branch, workDate]);

  return state;
}
