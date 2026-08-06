"use client";

import { useEffect, useState } from "react";
import { plannedTasksFromActivities, type PlannedDayTask } from "./planned-day-tasks.ts";
import { fetchDayEvent } from "./shift-schedule-store.ts";

/**
 * Stock งานประจำ the owner planned on the shift grid for this branch-day.
 *
 * Read client-side with the same Firebase client the planner writes with (the dashboard
 * can't rely on admin credentials being present), and fails soft to an empty list so a
 * missing schedule never blanks the dashboard.
 */
export function usePlannedDayTasks(branch: string | undefined, workDate: string): PlannedDayTask[] {
  const [tasks, setTasks] = useState<PlannedDayTask[]>([]);

  useEffect(() => {
    if (!branch) {
      setTasks([]);
      return;
    }
    let alive = true;
    fetchDayEvent(branch, workDate)
      .then((event) => alive && setTasks(plannedTasksFromActivities(event?.activities)))
      .catch(() => alive && setTasks([]));
    return () => {
      alive = false;
    };
  }, [branch, workDate]);

  return tasks;
}
