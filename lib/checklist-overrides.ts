// Owner-editable overrides for the WEEKLY and MONTHLY checklists.
//
// The daily checklist already has its own richer config (lib/daily-checklist.ts +
// /admin/checklist-config). This file is the equivalent — deliberately simpler — layer for
// every other checklist the team runs, so the owner can reword / add / remove / reorder the
// tick items (and rename the หัวข้อ) per type without a deploy. Anything the owner has not
// touched keeps its built-in value.
//
// One Firestore doc per "scope" (weekly-stock / monthly-stock / weekly-event) holds a map of
// unitId → override. A unit is one editable checklist block:
//   - weekly-stock  : the Stock / Sleeve phase (one unit, id = phase.id)
//   - monthly-stock : the Stock Single card phase (one unit, id = phase.id)
//   - weekly-event  : each event's 6-step checklist (one unit per event, id = event.id)

import type { WeeklyEventChecklistItem } from "./weekly-event-tasks.ts";

export type ChecklistScope = "weekly-stock" | "monthly-stock" | "weekly-event";

export const CHECKLIST_SCOPES: ChecklistScope[] = ["weekly-stock", "monthly-stock", "weekly-event"];

/** One tick item in the editor. `id` keeps a renamed/reordered item tied to its saved ticks. */
export type OverrideItem = { id: string; title: string };

/** What the owner changed for one checklist block. Missing fields = keep built-in. */
export type UnitOverride = {
  /** rename the หัวข้อ (only used where a block shows a single title, e.g. the stock phases) */
  title?: string;
  /** reword the goal / description line */
  goal?: string;
  /** full replacement of the tick items, in the order the owner wants them shown */
  items?: OverrideItem[];
};

/** unitId → override. This is the whole document body for one scope. */
export type ChecklistOverrides = Record<string, UnitOverride>;

export const emptyChecklistOverrides: ChecklistOverrides = {};

/** Trims and drops empty items; returns undefined when nothing meaningful is set. */
export function normalizeUnitOverride(raw: UnitOverride | undefined): UnitOverride | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: UnitOverride = {};
  if (typeof raw.title === "string" && raw.title.trim()) out.title = raw.title.trim();
  if (typeof raw.goal === "string" && raw.goal.trim()) out.goal = raw.goal.trim();
  if (Array.isArray(raw.items)) {
    const items = raw.items
      .filter((item): item is OverrideItem => Boolean(item) && typeof item.title === "string")
      .map((item, index) => ({ id: slugItemId(item.id, index), title: item.title.trim() }))
      .filter((item) => item.title.length > 0);
    out.items = items;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Cleans a whole overrides map, dropping units that ended up empty. Run at save. */
export function normalizeChecklistOverrides(raw: ChecklistOverrides | undefined): ChecklistOverrides {
  const out: ChecklistOverrides = {};
  for (const [unitId, value] of Object.entries(raw || {})) {
    const clean = normalizeUnitOverride(value);
    if (unitId && clean) out[unitId] = clean;
  }
  return out;
}

/** A slug that is safe as an item id (and stable for React keys / tick keys). */
export function slugItemId(id: string | undefined, index: number): string {
  const base = (id || "").trim();
  if (base) return base;
  return `item-${index + 1}`;
}

/** Editor seed: turn a plain string[] checklist into editable items. */
export function itemsFromStrings(strings: string[]): OverrideItem[] {
  return strings.map((title, index) => ({ id: `item-${index + 1}`, title }));
}

// ---- apply: string[] checklist blocks (weekly-stock, monthly-stock) ----

/**
 * A phase whose checklist is a plain list of strings — the weekly/monthly stock phases.
 * Returns a new phase with the owner's title/goal/items applied; untouched fields fall back
 * to the built-in value.
 */
export function applyStringPhaseOverride<T extends { title: string; goal?: string; checklist: string[] }>(
  phase: T,
  override: UnitOverride | undefined
): T {
  const clean = normalizeUnitOverride(override);
  if (!clean) return phase;
  const next: T = { ...phase };
  if (clean.title) next.title = clean.title;
  if (clean.goal && "goal" in phase) (next as { goal?: string }).goal = clean.goal;
  if (clean.items) next.checklist = clean.items.map((item) => item.title);
  return next;
}

// ---- apply: weekly-event checklist (list of {id,title,...} items) ----

/**
 * Applies an override to an event's checklist. Items keep their built-in detail (requiredData,
 * evidence, hints) — only the title is reworded. Items the owner added are new simple ticks
 * (no extra fields to fill); items the owner removed drop out of the list. When the owner has
 * not set `items`, the built-in checklist is returned unchanged. `makeCustomItem` defaults to
 * a plain title-only tick, but the caller may pass its own factory.
 */
export function applyEventChecklistOverride(
  checklist: WeeklyEventChecklistItem[],
  override: UnitOverride | undefined,
  makeCustomItem: (item: OverrideItem) => WeeklyEventChecklistItem = makeCustomEventItem
): WeeklyEventChecklistItem[] {
  const clean = normalizeUnitOverride(override);
  if (!clean || !clean.items) return checklist;
  const byId = new Map(checklist.map((item) => [item.id, item]));
  return clean.items.map((item) => {
    const base = byId.get(item.id);
    if (base) return { ...base, title: item.title };
    return makeCustomItem(item);
  });
}

/** Default factory for an owner-added event tick item: a plain title with no data to fill. */
export function makeCustomEventItem(item: OverrideItem): WeeklyEventChecklistItem {
  return { id: item.id, title: item.title, requiredData: [], evidence: [] };
}
