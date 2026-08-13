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
import { type ItemLink, normalizeLinks } from "./checklist-links.ts";
import type { EvidenceKind, ItemEvidence } from "./daily-checklist.ts";

// The หลักฐาน requirement an item may carry reuses the daily checklist's ItemEvidence shape
// (kinds: photo/link + optional note) so the weekly/monthly editor and staff views behave the
// same way the daily one does.
export type { EvidenceKind, ItemEvidence } from "./daily-checklist.ts";
const EVIDENCE_KINDS: EvidenceKind[] = ["photo", "link"];

/** Cleans an owner-set หลักฐาน requirement; undefined when it asks for nothing. */
export function normalizeItemEvidence(raw: ItemEvidence | undefined): ItemEvidence | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const kinds = Array.isArray(raw.kinds)
    ? raw.kinds.filter((kind): kind is EvidenceKind => EVIDENCE_KINDS.includes(kind as EvidenceKind))
    : [];
  const uniq = Array.from(new Set(kinds));
  if (!uniq.length) return undefined;
  const note = typeof raw.note === "string" ? raw.note.trim() : "";
  return note ? { kinds: uniq, note } : { kinds: uniq };
}

export type ChecklistScope = "weekly-stock" | "monthly-stock" | "weekly-event";

export const CHECKLIST_SCOPES: ChecklistScope[] = ["weekly-stock", "monthly-stock", "weekly-event"];

/**
 * "ส่งงานแบบไหน" ของรายการหนึ่ง — เหมือนชนิดคำถามใน Google Form. ไม่ได้ตั้ง = `tick` (ติ๊กเฉยๆ)
 * ซึ่งเป็นพฤติกรรมเดิมของทุกรายการที่บันทึกไว้ก่อนหน้านี้.
 */
export type AnswerKind = "tick" | "text" | "number" | "photo" | "link" | "choice";

export const ANSWER_KINDS: AnswerKind[] = ["tick", "text", "number", "photo", "link", "choice"];

/** ป้ายภาษาไทยของแต่ละแบบ ใช้ทั้งหน้า config และหน้าพนักงาน */
export const ANSWER_KIND_LABEL: Record<AnswerKind, string> = {
  tick: "ติ๊กว่าทำแล้ว",
  text: "พิมพ์ข้อความสั้นๆ",
  number: "กรอกตัวเลข",
  photo: "แนบรูป",
  link: "วางลิงก์",
  choice: "เลือกจากตัวเลือก"
};

export type ItemAnswer = {
  kind: AnswerKind;
  /** ตัวเลือกให้เลือก (ใช้เมื่อ kind = choice) */
  options?: string[];
  /** ข้อความช่วยบอกว่าให้กรอกอะไร */
  placeholder?: string;
};

/** ต้องกรอก/แนบอะไรก่อนถึงจะติ๊กผ่านไหม — ติ๊กเฉยๆ = ไม่ต้อง */
export function answerNeedsInput(answer: ItemAnswer | undefined): boolean {
  return Boolean(answer) && answer!.kind !== "tick";
}

/** Cleans an owner-set answer type; undefined เมื่อเป็นการติ๊กธรรมดา (ค่า default) */
export function normalizeItemAnswer(raw: ItemAnswer | undefined): ItemAnswer | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const kind = ANSWER_KINDS.includes(raw.kind) ? raw.kind : "tick";
  if (kind === "tick") return undefined;
  const out: ItemAnswer = { kind };
  const placeholder = typeof raw.placeholder === "string" ? raw.placeholder.trim() : "";
  if (placeholder) out.placeholder = placeholder;
  if (kind === "choice") {
    const options = Array.isArray(raw.options)
      ? raw.options.filter((option): option is string => typeof option === "string").map((option) => option.trim()).filter(Boolean)
      : [];
    // ตัวเลือกว่างเปล่า = ไม่มีอะไรให้เลือก → ถอยกลับเป็นพิมพ์ข้อความ ดีกว่าค้างกดไม่ได้
    if (!options.length) return { kind: "text", ...(placeholder ? { placeholder } : {}) };
    out.options = options.slice(0, 20);
  }
  return out;
}

/**
 * One tick item in the editor. `id` keeps a renamed/reordered item tied to its saved ticks.
 * `note` (คำอธิบายว่าต้องทำอะไร) and `links` (ปุ่มกดไปหน้างานจริง) are optional — an item saved
 * before these fields existed simply omits them, and every reader treats missing as empty.
 * `answer` (ส่งงานแบบไหน), `timeLabel` (เวลา) and `shiftLabel` (กะ) are per-item and optional too.
 */
export type OverrideItem = {
  id: string;
  title: string;
  note?: string;
  links?: ItemLink[];
  evidence?: ItemEvidence;
  answer?: ItemAnswer;
  /** เวลาของรายการนี้ เช่น "ก่อน 12:00" หรือ "หลังปิดร้าน" */
  timeLabel?: string;
  /** กะที่ต้องทำรายการนี้ เช่น "กะ 1" */
  shiftLabel?: string;
};

/** What the owner changed for one checklist block. Missing fields = keep built-in. */
export type UnitOverride = {
  /** rename the หัวข้อ (only used where a block shows a single title, e.g. the stock phases) */
  title?: string;
  /** reword the goal / description line */
  goal?: string;
  /** full replacement of the tick items, in the order the owner wants them shown */
  items?: OverrideItem[];
  /**
   * เวลา — free-text time label shown on the card (e.g. "งานประจำสัปดาห์ · ตามเวลาเปิด-ปิดร้าน",
   * "11:00-23:59"). Replaces the built-in timeLabel/timeWindow of the block. Free text (not a
   * HH:MM window) because these blocks display a readable schedule, not a submit-gate clock.
   */
  timeLabel?: string;
  /** กะที่รับผิดชอบ — free-text shift label (e.g. "กะ 1", "กะ 2", "ทุกกะ"). Empty = ไม่ระบุ. */
  shiftLabel?: string;
};

/** unitId → override. */
export type ChecklistOverrides = Record<string, UnitOverride>;

export const emptyChecklistOverrides: ChecklistOverrides = {};

/** หัวข้อใหญ่ ที่เจ้าของเพิ่มเองในสัปดาห์/เดือน (ไม่มีในโค้ด) — items อยู่ใน overrides[id].items */
export type CustomUnit = { id: string; title: string };

/**
 * ทั้งเอกสารของหนึ่ง scope. เดิมเก็บแค่ `overrides`; ตอนนี้เก็บลำดับ/ปิดหัวข้อ/หัวข้อที่เพิ่มเอง
 * ด้วย เพื่อให้หน้าแก้ Weekly/Monthly ทำได้เท่ากับหน้า Daily (เพิ่มหัวข้อ ปิดหัวข้อ สลับลำดับ
 * ย้ายรายการข้ามหัวข้อ). เอกสารเก่าที่มีแค่ overrides อ่านได้เหมือนเดิม (ฟิลด์ใหม่ = ว่าง).
 */
export type ChecklistScopeConfig = {
  overrides: ChecklistOverrides;
  /** unitId ตามลำดับที่เจ้าของจัด (unit ที่ไม่อยู่ในนี้ต่อท้ายตามลำดับ built-in) */
  order: string[];
  /** unitId ที่ปิดไว้ — พนักงานไม่เห็น และไม่ต้องทำ */
  hidden: string[];
  /** หัวข้อใหญ่ที่เจ้าของเพิ่มเอง */
  customUnits: CustomUnit[];
  /**
   * รายการของช่วงนี้ถูกย้ายไปอยู่ในระบบ "สั่งงาน" (/admin/tasks) แล้ว — หน้าพนักงานจะชี้ไปที่
   * หน้างานวันนี้แทน ไม่ให้ติ๊กซ้ำสองที่. เก็บของเดิมไว้ ไม่ลบ เผื่อต้องย้อนดู
   */
  migratedToTasks?: boolean;
};

export const emptyChecklistScopeConfig: ChecklistScopeConfig = {
  overrides: {},
  order: [],
  hidden: [],
  customUnits: []
};

/** Cleans a whole scope document (run on read and on save). */
export function normalizeScopeConfig(raw: Partial<ChecklistScopeConfig> | undefined): ChecklistScopeConfig {
  const overrides = normalizeChecklistOverrides((raw?.overrides || {}) as ChecklistOverrides);
  const customUnits: CustomUnit[] = Array.isArray(raw?.customUnits)
    ? raw!.customUnits
        .filter((unit): unit is CustomUnit => Boolean(unit) && typeof unit.id === "string" && typeof unit.title === "string")
        .map((unit) => ({ id: unit.id.trim(), title: unit.title.trim() }))
        .filter((unit) => unit.id && unit.title)
    : [];
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? Array.from(new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0))) : [];
  const out: ChecklistScopeConfig = { overrides, order: strings(raw?.order), hidden: strings(raw?.hidden), customUnits };
  if (raw?.migratedToTasks) out.migratedToTasks = true;
  return out;
}

/** unitIds ตามลำดับที่จะแสดง: ตามที่เจ้าของจัดก่อน แล้วต่อด้วยที่เหลือ */
export function orderedUnitIds(builtinIds: string[], config: ChecklistScopeConfig): string[] {
  const all = [...builtinIds, ...config.customUnits.map((unit) => unit.id)];
  const ordered = config.order.filter((id) => all.includes(id));
  return [...ordered, ...all.filter((id) => !ordered.includes(id))];
}

export function isUnitHidden(config: ChecklistScopeConfig, unitId: string): boolean {
  return config.hidden.includes(unitId);
}

/** A slug that is safe as a custom unit id — mirrors the daily editor's customPhaseId. */
export function customUnitId(title: string, existing: string[] = []): string {
  const base = `custom-${title.trim()}`.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9ก-๙-]/g, "").toLowerCase() || "custom-unit";
  if (!existing.includes(base)) return base;
  let suffix = 2;
  while (existing.includes(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

/**
 * ย้ายหนึ่งรายการข้ามหัวข้อ (ปุ่ม "ย้ายไป…" แบบเดียวกับหน้า Daily). คืน items map ใหม่ทั้งก้อน —
 * รายการที่ย้ายไปต่อท้ายหัวข้อปลายทาง และ id ถูกตั้งใหม่ไม่ให้ชนกับของเดิมในหัวข้อนั้น.
 */
export function moveUnitItem(
  itemsByUnit: Record<string, OverrideItem[]>,
  from: { unitId: string; index: number },
  toUnitId: string
): Record<string, OverrideItem[]> {
  const source = itemsByUnit[from.unitId] || [];
  const item = source[from.index];
  if (!item || from.unitId === toUnitId) return itemsByUnit;
  const target = itemsByUnit[toUnitId] || [];
  const taken = new Set(target.map((row) => row.id));
  let id = item.id;
  let suffix = 2;
  while (taken.has(id)) {
    id = `${item.id}-${suffix}`;
    suffix += 1;
  }
  return {
    ...itemsByUnit,
    [from.unitId]: source.filter((_, index) => index !== from.index),
    [toUnitId]: [...target, { ...item, id }]
  };
}

/** Trims and drops empty items; returns undefined when nothing meaningful is set. */
export function normalizeUnitOverride(raw: UnitOverride | undefined): UnitOverride | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: UnitOverride = {};
  if (typeof raw.title === "string" && raw.title.trim()) out.title = raw.title.trim();
  if (typeof raw.goal === "string" && raw.goal.trim()) out.goal = raw.goal.trim();
  if (typeof raw.timeLabel === "string" && raw.timeLabel.trim()) out.timeLabel = raw.timeLabel.trim();
  if (typeof raw.shiftLabel === "string" && raw.shiftLabel.trim()) out.shiftLabel = raw.shiftLabel.trim();
  if (Array.isArray(raw.items)) {
    const items = raw.items
      .filter((item): item is OverrideItem => Boolean(item) && typeof item.title === "string")
      .map((item, index) => normalizeOverrideItem(item, index))
      .filter((item) => item.title.length > 0);
    out.items = items;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Trims one item and attaches its cleaned note + valid links (dropping empties). */
export function normalizeOverrideItem(item: OverrideItem, index: number): OverrideItem {
  const out: OverrideItem = { id: slugItemId(item.id, index), title: (item.title || "").trim() };
  const note = typeof item.note === "string" ? item.note.trim() : "";
  if (note) out.note = note;
  const links = normalizeLinks(item.links);
  if (links.length) out.links = links;
  const evidence = normalizeItemEvidence(item.evidence);
  if (evidence) out.evidence = evidence;
  const answer = normalizeItemAnswer(item.answer);
  if (answer) out.answer = answer;
  const timeLabel = typeof item.timeLabel === "string" ? item.timeLabel.trim() : "";
  if (timeLabel) out.timeLabel = timeLabel;
  const shiftLabel = typeof item.shiftLabel === "string" ? item.shiftLabel.trim() : "";
  if (shiftLabel) out.shiftLabel = shiftLabel;
  return out;
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
export function applyStringPhaseOverride<
  T extends { title: string; goal?: string; checklist: string[]; timeLabel?: string; shiftLabel?: string }
>(phase: T, override: UnitOverride | undefined): T {
  const clean = normalizeUnitOverride(override);
  if (!clean) return phase;
  const next: T = { ...phase };
  if (clean.title) next.title = clean.title;
  if (clean.goal && "goal" in phase) (next as { goal?: string }).goal = clean.goal;
  if (clean.items) next.checklist = clean.items.map((item) => item.title);
  if (clean.timeLabel) (next as { timeLabel?: string }).timeLabel = clean.timeLabel;
  if (clean.shiftLabel) (next as { shiftLabel?: string }).shiftLabel = clean.shiftLabel;
  return next;
}

/**
 * The editable items (with note/links) that line up 1:1 with the string[] `checklist` produced by
 * applyStringPhaseOverride: the owner's items when they set any, else the built-in items. Staff
 * stock views use this to render each item's รายละเอียด/ปุ่มลิงก์ by the same index they tick.
 */
export function resolvePhaseChecklistItems(baseItems: OverrideItem[], override: UnitOverride | undefined): OverrideItem[] {
  const clean = normalizeUnitOverride(override);
  if (clean?.items) return clean.items;
  return baseItems;
}

/**
 * Applies the owner's เวลา / กะ overrides to a weekly-event block. The event's timeWindow is the
 * readable schedule shown on the card; shiftLabel is an optional "กะที่รับผิดชอบ" line. Checklist
 * items are handled separately by applyEventChecklistOverride — this only touches the card meta.
 */
export function applyEventMetaOverride<T extends { timeWindow: string; shiftLabel?: string }>(
  event: T,
  override: UnitOverride | undefined
): T {
  const clean = normalizeUnitOverride(override);
  if (!clean) return event;
  const next: T = { ...event };
  if (clean.timeLabel) next.timeWindow = clean.timeLabel;
  if (clean.shiftLabel) next.shiftLabel = clean.shiftLabel;
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
    // Owner's note/links win; a base item keeps its own only if the override left them unset.
    if (base) return { ...base, title: item.title, note: item.note ?? base.note, links: item.links ?? base.links };
    return makeCustomItem(item);
  });
}

/** Default factory for an owner-added event tick item: a plain title carrying its note/links. */
export function makeCustomEventItem(item: OverrideItem): WeeklyEventChecklistItem {
  return { id: item.id, title: item.title, requiredData: [], evidence: [], note: item.note, links: item.links };
}
