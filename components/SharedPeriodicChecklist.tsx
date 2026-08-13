"use client";

import { useEffect, useState } from "react";
import { ChecklistItemGuide } from "./ChecklistItemGuide.tsx";
import { periodicTickKey, periodKeyFor, resolvePeriodicUnits, scopeForPeriod } from "../lib/periodic-tasks.ts";
import { useChecklistScopeConfig } from "../lib/checklist-overrides-store.ts";
import { fetchSharedTicks, setSharedTick, type SharedTick } from "../lib/shared-tasks-store.ts";
import { displayNameFor } from "../lib/employee-directory.ts";

export function SharedPeriodicChecklist({
  period,
  branch,
  workDate,
  staffCode,
  readOnly = false
}: {
  period: "weekly" | "monthly";
  branch: string;
  workDate: string;
  /** who is ticking — falls back to "-" for admins not in the directory */
  staffCode: string;
  /** Admin previewing this account — read the shared ticks, never write them. */
  readOnly?: boolean;
}) {
  const periodKey = periodKeyFor(period, workDate);
  // หัวข้อ + รายการ ตามที่เจ้าของแก้ไว้ (/admin/checklist-config/weekly|monthly) — ยังไม่โหลดเสร็จ
  // ก็ขึ้นรายการ built-in ไปก่อน เหมือน checklist รายวัน
  const config = useChecklistScopeConfig(scopeForPeriod(period));
  const units = resolvePeriodicUnits(period, config);
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
    if (readOnly) return;
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

  const allKeys = units.flatMap((unit) => unit.items.map((item) => periodicTickKey(period, unit.id, item.id)));
  const done = allKeys.filter((key) => ticks[key]).length;

  return (
    <div className="shared-checklist">
      <p className="shared-checklist__meta">
        {period === "weekly" ? "สัปดาห์นี้" : "เดือนนี้"} ({periodKey}) · เสร็จ {done}/{allKeys.length} · ช่วยกันทั้งทีม
      </p>
      {/* Tasks render immediately — never hide the list behind a spinner (that made the tab look
          empty / "ไม่ไป" while Firestore loaded ticks on a slow connection). Tick state just fills
          in when the fetch resolves. */}
      {units.map((unit) => (
        <section key={unit.id} className="shared-checklist__unit">
          {units.length > 1 ? <p className="shared-checklist__unit-title">{unit.title}</p> : null}
          <ul className="shared-checklist__list">
            {unit.items.map((item) => {
              const key = periodicTickKey(period, unit.id, item.id);
              const tick = ticks[key];
              return (
                <li key={key} className={tick ? "shared-checklist__item shared-checklist__item--done" : "shared-checklist__item"}>
                  <button type="button" onClick={() => toggle(key)} aria-pressed={!!tick} disabled={loading || readOnly}>
                    {tick ? "●" : "○"}
                  </button>
                  <span>
                    <strong>{item.title}</strong>
                    <ChecklistItemGuide note={item.note} links={item.links} />
                    {tick ? <small>โดย {displayNameFor(tick.by)}</small> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {units.length === 0 ? <p className="shared-checklist__meta">ยังไม่มีรายการในช่วงนี้</p> : null}
    </div>
  );
}
