"use client";

import { useEffect, useState } from "react";
import { periodKeyFor, tasksFor } from "../lib/periodic-tasks.ts";
import { fetchSharedTicks, setSharedTick, type SharedTick } from "../lib/shared-tasks-store.ts";
import { displayNameFor } from "../lib/employee-directory.ts";

export function SharedPeriodicChecklist({
  period,
  branch,
  workDate,
  staffCode
}: {
  period: "weekly" | "monthly";
  branch: string;
  workDate: string;
  /** who is ticking — falls back to "-" for admins not in the directory */
  staffCode: string;
}) {
  const periodKey = periodKeyFor(period, workDate);
  const tasks = tasksFor(period);
  const [ticks, setTicks] = useState<Record<string, SharedTick>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchSharedTicks(branch, period, periodKey)
      .then((data) => alive && setTicks(data))
      .catch(() => alive && setTicks({}))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [branch, period, periodKey]);

  async function toggle(taskId: string) {
    const ticked = !ticks[taskId];
    const optimistic = { ...ticks };
    if (ticked) optimistic[taskId] = { by: staffCode, at: "…" };
    else delete optimistic[taskId];
    setTicks(optimistic);
    try {
      const next = await setSharedTick({
        branch,
        period,
        periodKey,
        taskId,
        ticked,
        by: staffCode,
        atIso: new Date().toISOString(),
        currentTicks: ticks
      });
      setTicks(next);
    } catch {
      setTicks(ticks); // revert on failure
    }
  }

  const done = tasks.filter((t) => ticks[t.id]).length;

  return (
    <div className="shared-checklist">
      <p className="shared-checklist__meta">
        {period === "weekly" ? "สัปดาห์นี้" : "เดือนนี้"} ({periodKey}) · เสร็จ {done}/{tasks.length} · ช่วยกันทั้งทีม
      </p>
      {/* Tasks are static, so render them immediately — never hide the list behind a
          spinner (that made the tab look empty / "ไม่ไป" while Firestore loaded ticks
          on a slow connection). Tick state just fills in when the fetch resolves. */}
      <ul className="shared-checklist__list">
        {tasks.map((task) => {
          const tick = ticks[task.id];
          return (
            <li key={task.id} className={tick ? "shared-checklist__item shared-checklist__item--done" : "shared-checklist__item"}>
              <button type="button" onClick={() => toggle(task.id)} aria-pressed={!!tick} disabled={loading}>
                {tick ? "●" : "○"}
              </button>
              <span>
                <strong>{task.title}</strong>
                {task.hint ? <em>{task.hint}</em> : null}
                {tick ? <small>โดย {displayNameFor(tick.by)}</small> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
