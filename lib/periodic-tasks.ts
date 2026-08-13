// Weekly / monthly shared tasks — the second checklist tab. Unlike the per-shift
// daily routine, these are team-shared ("ช่วยกันกับเพื่อน"): anyone on shift can
// tick an item and everyone sees it, because the whole team must finish them within
// the period. State is keyed by ISO week / calendar month so a new period starts
// fresh. The lists below are the built-in starting point; the owner edits them (and
// adds their own หัวข้อ) at /admin/checklist-config/weekly|monthly, exactly like the
// daily checklist. Ticks live in Firestore (shared-tasks-store).

import {
  isUnitHidden,
  orderedUnitIds,
  resolvePhaseChecklistItems,
  type ChecklistScope,
  type ChecklistScopeConfig,
  type OverrideItem
} from "./checklist-overrides.ts";

export type PeriodicTask = {
  id: string;
  title: string;
  hint?: string;
};

export const weeklyTasks: PeriodicTask[] = [
  { id: "w-sleeve", title: "นับ Sleeve / อุปกรณ์ทั้งหมด", hint: "เทียบกับ StoreHub" },
  { id: "w-booster", title: "นับ Booster box / Box all cards" },
  { id: "w-clean", title: "ทำความสะอาดใหญ่พื้นที่เล่น + ตู้โชว์" },
  { id: "w-supply", title: "สรุปของที่ต้องสั่งเพิ่มประจำสัปดาห์ จาก StoreHub Supply Needs" }
];

export const monthlyTasks: PeriodicTask[] = [
  { id: "m-stock", title: "นับ Stock รวมประจำเดือน" },
  { id: "m-single", title: "นับ Single card แยกแฟ้ม" },
  { id: "m-diff", title: "สรุปยอดต่างและรายการปรับใน StoreHub" }
];

/** ISO-week key like 2026-W30 for a given YYYY-MM-DD (Bangkok noon anchor). */
export function isoWeekKey(workDate: string): string {
  const date = new Date(`${workDate}T12:00:00+07:00`);
  // Shift to Thursday of this week (ISO weeks are Thursday-anchored).
  const day = (date.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Calendar-month key like 2026-07 for a given YYYY-MM-DD. */
export function monthKey(workDate: string): string {
  return workDate.slice(0, 7);
}

export function periodKeyFor(period: "weekly" | "monthly", workDate: string): string {
  return period === "weekly" ? isoWeekKey(workDate) : monthKey(workDate);
}

export function tasksFor(period: "weekly" | "monthly"): PeriodicTask[] {
  return period === "weekly" ? weeklyTasks : monthlyTasks;
}

// ---- owner-editable layer (same format as the daily checklist) ----------------

export type PeriodicPeriod = "weekly" | "monthly";

/** The หัวข้อ that holds the built-in shared tasks of a period, inside that period's scope doc. */
export const WEEKLY_SHARED_UNIT_ID = "weekly-shared-tasks";
export const MONTHLY_SHARED_UNIT_ID = "monthly-shared-tasks";

export function sharedUnitIdFor(period: PeriodicPeriod): string {
  return period === "weekly" ? WEEKLY_SHARED_UNIT_ID : MONTHLY_SHARED_UNIT_ID;
}

/** Weekly units live in the weekly-stock scope doc, monthly ones in monthly-stock. */
export function scopeForPeriod(period: PeriodicPeriod): ChecklistScope {
  return period === "weekly" ? "weekly-stock" : "monthly-stock";
}

export function sharedUnitTitle(period: PeriodicPeriod): string {
  return period === "weekly" ? "งานประจำสัปดาห์ที่ช่วยกันทำ" : "งานประจำเดือนที่ช่วยกันทำ";
}

/** Built-in tasks as editable items (the hint becomes the item's รายละเอียด). */
export function baseItemsFor(period: PeriodicPeriod): OverrideItem[] {
  return tasksFor(period).map((task) => (task.hint ? { id: task.id, title: task.title, note: task.hint } : { id: task.id, title: task.title }));
}

/** One tickable block on the staff Weekly / Monthly tab. */
export type PeriodicUnit = { id: string; title: string; items: OverrideItem[] };

/**
 * The blocks a staffer sees for a period: the built-in shared tasks (as the owner edited them)
 * plus any หัวข้อ the owner added, in the owner's order, minus the ones switched off. With no
 * saved config this returns exactly the built-in list, so a fresh install looks unchanged.
 */
export function resolvePeriodicUnits(period: PeriodicPeriod, config: ChecklistScopeConfig): PeriodicUnit[] {
  const sharedId = sharedUnitIdFor(period);
  const tickableIds = [sharedId, ...config.customUnits.map((unit) => unit.id)];
  return orderedUnitIds([sharedId], config)
    .filter((unitId) => tickableIds.includes(unitId) && !isUnitHidden(config, unitId))
    .map((unitId) => {
      const override = config.overrides[unitId];
      const custom = config.customUnits.find((unit) => unit.id === unitId);
      const baseItems = unitId === sharedId ? baseItemsFor(period) : [];
      return {
        id: unitId,
        title: override?.title || custom?.title || sharedUnitTitle(period),
        items: resolvePhaseChecklistItems(baseItems, override)
      };
    })
    .filter((unit) => unit.items.length > 0);
}

/**
 * Tick key stored in shared-tasks. The built-in shared unit keeps the bare task id so ticks
 * recorded before the owner-editable layer existed still line up; every other หัวข้อ is namespaced.
 */
export function periodicTickKey(period: PeriodicPeriod, unitId: string, itemId: string): string {
  return unitId === sharedUnitIdFor(period) ? itemId : `${unitId}::${itemId}`;
}
