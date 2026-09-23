// ความคืบหน้าของงานหนึ่งชิ้น — "กดเริ่มทำ → อัพเดทเป็น % → เสร็จ / ติดปัญหา".
//
// เดิมงานประจำ (รายวัน/สัปดาห์/เดือน) มีแค่สองสถานะ: ติ๊กแล้ว กับ ยังไม่ติ๊ก. งานที่ใช้เวลา
// (นับ stock ทั้งร้าน, ทำความสะอาดใหญ่) เลยไม่มีที่ให้บอกว่าทำไปถึงไหน ใครทำค้างไว้ หรือ
// ติดอะไรอยู่ — หัวหน้าเห็นแค่ "ยังไม่เสร็จ" เท่ากันหมด.
//
// ไฟล์นี้เก็บ type + logic ล้วน (ไม่มี Firestore) เพื่อให้หน้าจอพนักงาน หน้าแอดมิน และ API
// ตัดสินใจเหมือนกัน และ test ได้.
//
// การเก็บ: หนึ่ง entry ต่อ "งาน + รอบของงาน" ไม่ใช่ต่อวัน — งานรายสัปดาห์ที่เริ่มวันจันทร์
// แล้วทำต่อวันอังคาร ต้องเห็นเป็นชิ้นเดียวกัน (ดู periodKeyForFrequency).

import type { WorkFrequency, WorkSchedule } from "./work-spec.ts";
import { isoWeekKey, monthKey } from "./periodic-tasks.ts";

export type TaskProgressStatus = "in_progress" | "stuck" | "done";

export type TaskProgressAction = "start" | "update" | "stuck" | "resume" | "finish" | "reopen" | "clear";

/** หนึ่งบรรทัดในไทม์ไลน์ของงาน — ใครกดอะไร ตอนไหน ถึงกี่ % พร้อมโน้ต/รูป */
export type TaskProgressUpdate = {
  kind: Exclude<TaskProgressAction, "clear">;
  by: string;
  at: string;
  percent: number;
  note?: string;
  photos?: string[];
};

export type TaskProgressEntry = {
  status: TaskProgressStatus;
  /** 0–100 */
  percent: number;
  startedBy: string;
  startedAt: string;
  updatedBy: string;
  updatedAt: string;
  /** เหตุผลที่ติดปัญหา (มีเฉพาะตอน status = stuck) */
  blockedNote?: string;
  doneBy?: string;
  doneAt?: string;
  updates: TaskProgressUpdate[];
};

/** เก็บไทม์ไลน์ล่าสุดเท่านี้ต่อหนึ่งงาน — กันเอกสารโตจนชน 1 MiB ของ Firestore */
export const MAX_PROGRESS_UPDATES = 12;
/**
 * เก็บงานย้อนหลังในเอกสารเดียวได้เท่านี้ชิ้น (เรียงจากใหม่ไปเก่า).
 * 150 ชิ้น × ไทม์ไลน์ 12 บรรทัด ยังห่างจากลิมิต 1 MiB ต่อเอกสารของ Firestore มาก.
 */
export const MAX_PROGRESS_ENTRIES = 150;

export const PROGRESS_STEPS = [25, 50, 75, 100];

export function clampPercent(value: unknown, fallback = 0): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

// ---- รอบของงาน ---------------------------------------------------------------

/**
 * งานชิ้นเดียวกัน "รอบ" เดียวกันคือคีย์เดียวกัน:
 *   รายวัน / ครั้งเดียว / ตามกิจกรรม → ต่อวัน
 *   รายสัปดาห์ / สัปดาห์เว้นสัปดาห์  → ต่อสัปดาห์ ISO (ทำค้างข้ามวันได้)
 *   รายเดือน                         → ต่อเดือน
 *   ช่วงวันที่                        → ทั้งช่วงคือรอบเดียว
 */
export function periodKeyForFrequency(frequency: WorkFrequency, date: string, schedule?: WorkSchedule): string {
  switch (frequency) {
    case "weekly":
    case "biweekly":
      return isoWeekKey(date);
    case "monthly":
      return monthKey(date);
    case "range":
      return schedule?.startDate ? `r-${schedule.startDate}` : date;
    default:
      return date;
  }
}

export function periodKeyForSchedule(schedule: WorkSchedule, date: string): string {
  return periodKeyForFrequency(schedule.frequency, date, schedule);
}

/** คีย์ของงาน+รอบ ในแผนที่ progress ที่เก็บรวมไว้เอกสารเดียวต่อสาขา */
export function progressKey(taskId: string, periodKey: string): string {
  return `${taskId}::${periodKey}`;
}

export function splitProgressKey(key: string): { taskId: string; periodKey: string } {
  const at = key.lastIndexOf("::");
  if (at === -1) return { taskId: key, periodKey: "" };
  return { taskId: key.slice(0, at), periodKey: key.slice(at + 2) };
}

// ---- เปลี่ยนสถานะ -------------------------------------------------------------

export type ProgressActionInput = {
  action: TaskProgressAction;
  by: string;
  at: string;
  percent?: number;
  note?: string;
  photos?: string[];
};

/** % ล่าสุดก่อนกดเสร็จ — ใช้ตอนกด "กลับมาทำต่อ" เพื่อไม่ให้เด้งกลับไป 0 */
function percentBeforeFinish(entry: TaskProgressEntry): number {
  for (let index = entry.updates.length - 1; index >= 0; index -= 1) {
    const update = entry.updates[index];
    if (update.kind !== "finish") return Math.min(update.percent, 99);
  }
  return 0;
}

function pushUpdate(entry: TaskProgressEntry, update: TaskProgressUpdate): TaskProgressUpdate[] {
  return [...entry.updates, update].slice(-MAX_PROGRESS_UPDATES);
}

/**
 * ผลลัพธ์ของการกดปุ่มหนึ่งครั้ง. คืน null = ลบงานนั้นออกจาก progress (กดยกเลิกทั้งหมด).
 * กติกา: ต้อง "เริ่มทำ" ก่อนถึงจะอัพเดท % ได้ แต่กด "เสร็จเลย" ข้ามได้ทันที (งานสั้นๆ
 * ไม่ต้องบังคับกดสองที) — งานที่กดเสร็จเลยจะถูกบันทึกว่าเริ่มและจบพร้อมกัน.
 */
export function applyProgressAction(
  current: TaskProgressEntry | undefined,
  input: ProgressActionInput
): TaskProgressEntry | null {
  const { action, by, at } = input;
  const note = typeof input.note === "string" ? input.note.trim() : "";
  const photos = Array.isArray(input.photos) ? input.photos.filter((url) => typeof url === "string" && url) : [];

  if (action === "clear") return null;

  if (!current) {
    // ยังไม่เคยแตะงานนี้
    if (action === "update" || action === "resume" || action === "reopen") return null;
    const finishing = action === "finish";
    const percent = finishing ? 100 : clampPercent(input.percent, 0);
    const status: TaskProgressStatus = finishing ? "done" : action === "stuck" ? "stuck" : "in_progress";
    const first: TaskProgressUpdate = {
      kind: action,
      by,
      at,
      percent,
      ...(note ? { note } : {}),
      ...(photos.length ? { photos } : {})
    };
    return {
      status,
      percent,
      startedBy: by,
      startedAt: at,
      updatedBy: by,
      updatedAt: at,
      ...(status === "stuck" && note ? { blockedNote: note } : {}),
      ...(finishing ? { doneBy: by, doneAt: at } : {}),
      updates: [first]
    };
  }

  const next: TaskProgressEntry = { ...current, updatedBy: by, updatedAt: at };

  switch (action) {
    case "start":
      // กดเริ่มซ้ำ = ไม่ทำอะไร (คนอื่นเริ่มไปแล้ว) แต่ยังบันทึกว่ามีคนมาช่วย
      next.status = current.status === "done" ? "done" : "in_progress";
      next.percent = clampPercent(input.percent, current.percent);
      break;
    case "update":
      next.status = "in_progress";
      next.percent = clampPercent(input.percent, current.percent);
      delete next.blockedNote;
      delete next.doneBy;
      delete next.doneAt;
      break;
    case "stuck":
      next.status = "stuck";
      next.percent = clampPercent(input.percent, current.percent);
      if (note) next.blockedNote = note;
      break;
    case "resume":
      next.status = "in_progress";
      next.percent = clampPercent(input.percent, current.percent);
      delete next.blockedNote;
      break;
    case "finish":
      next.status = "done";
      next.percent = 100;
      next.doneBy = by;
      next.doneAt = at;
      delete next.blockedNote;
      break;
    case "reopen":
      next.status = "in_progress";
      next.percent = clampPercent(input.percent, percentBeforeFinish(current));
      delete next.doneBy;
      delete next.doneAt;
      break;
    default:
      return current;
  }

  next.updates = pushUpdate(current, {
    kind: action,
    by,
    at,
    percent: next.percent,
    ...(note ? { note } : {}),
    ...(photos.length ? { photos } : {})
  });
  return next;
}

// ---- อ่านสถานะ ---------------------------------------------------------------

export function statusLabel(entry: TaskProgressEntry | undefined, done: boolean): string {
  if (done || entry?.status === "done") return "เสร็จแล้ว";
  if (!entry) return "ยังไม่เริ่ม";
  if (entry.status === "stuck") return "ติดปัญหา";
  return `กำลังทำ ${entry.percent}%`;
}

/** % ของงานหนึ่งชิ้นเพื่อเอาไปเฉลี่ย — ติ๊กเสร็จแบบเก่า (ไม่มี entry) นับเป็น 100 */
export function percentOf(entry: TaskProgressEntry | undefined, done: boolean): number {
  if (done || entry?.status === "done") return 100;
  return entry ? entry.percent : 0;
}

export type ProgressSummary = {
  total: number;
  done: number;
  active: number;
  stuck: number;
  notStarted: number;
  /** % เฉลี่ยของงานทั้งหมดในลิสต์ */
  percent: number;
};

export function summarizeProgress(items: Array<{ done: boolean; entry?: TaskProgressEntry }>): ProgressSummary {
  const summary: ProgressSummary = { total: items.length, done: 0, active: 0, stuck: 0, notStarted: 0, percent: 0 };
  if (items.length === 0) return summary;
  let sum = 0;
  for (const item of items) {
    const finished = item.done || item.entry?.status === "done";
    if (finished) summary.done += 1;
    else if (item.entry?.status === "stuck") summary.stuck += 1;
    else if (item.entry) summary.active += 1;
    else summary.notStarted += 1;
    sum += percentOf(item.entry, item.done);
  }
  summary.percent = Math.round(sum / items.length);
  return summary;
}

/** งานที่ "ค้างอยู่" — เริ่มแล้วยังไม่เสร็จ ต้องตามไปทำต่อแม้วันนี้จะไม่ถึงกำหนด */
export function isUnfinished(entry: TaskProgressEntry | undefined, done: boolean): boolean {
  return Boolean(entry) && !done && entry!.status !== "done";
}

/**
 * งานค้างที่ต้องดันขึ้นมาให้เห็นวันนี้ — งานรายสัปดาห์/รายเดือนที่มีคนเริ่มไว้ในรอบนี้แล้ว
 * ยังไม่เสร็จ แม้วันนี้จะไม่ใช่วันที่ครบกำหนด. ไม่งั้นงานที่ทำค้างไว้วันจันทร์จะหายไป
 * จากหน้าจอวันอังคาร แล้วไม่มีใครทำต่อ.
 */
export function carryOverSpecs<T extends { id: string; active?: boolean; schedule: WorkSchedule }>(
  specs: T[],
  input: {
    date: string;
    /** id ของงานที่ขึ้นในลิสต์วันนี้อยู่แล้ว (จะไม่ถูกดันซ้ำ) */
    dueIds: Set<string> | string[];
    progress: Record<string, TaskProgressEntry>;
    /** งานที่ส่งแล้วของวันนี้ */
    doneIds?: Set<string> | string[];
  }
): T[] {
  const due = input.dueIds instanceof Set ? input.dueIds : new Set(input.dueIds);
  const done = input.doneIds instanceof Set ? input.doneIds : new Set(input.doneIds || []);
  return specs.filter((spec) => {
    if (spec.active === false || due.has(spec.id)) return false;
    const key = progressKey(spec.id, periodKeyForSchedule(spec.schedule, input.date));
    return isUnfinished(input.progress[key], done.has(spec.id));
  });
}

// ---- ล้างข้อมูลก่อนเก็บ / หลังอ่าน --------------------------------------------

function normalizeUpdate(raw: Partial<TaskProgressUpdate>): TaskProgressUpdate | null {
  const kinds: TaskProgressUpdate["kind"][] = ["start", "update", "stuck", "resume", "finish", "reopen"];
  if (!raw || !kinds.includes(raw.kind as TaskProgressUpdate["kind"])) return null;
  const by = typeof raw.by === "string" ? raw.by : "";
  const at = typeof raw.at === "string" ? raw.at : "";
  if (!by || !at) return null;
  const update: TaskProgressUpdate = { kind: raw.kind as TaskProgressUpdate["kind"], by, at, percent: clampPercent(raw.percent, 0) };
  if (typeof raw.note === "string" && raw.note.trim()) update.note = raw.note.trim().slice(0, 400);
  if (Array.isArray(raw.photos)) {
    const photos = raw.photos.filter((url): url is string => typeof url === "string" && url.length > 0).slice(0, 3);
    if (photos.length) update.photos = photos;
  }
  return update;
}

export function normalizeProgressEntry(raw: unknown): TaskProgressEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<TaskProgressEntry>;
  const status: TaskProgressStatus =
    value.status === "done" || value.status === "stuck" || value.status === "in_progress" ? value.status : "in_progress";
  const startedBy = typeof value.startedBy === "string" ? value.startedBy : "";
  const startedAt = typeof value.startedAt === "string" ? value.startedAt : "";
  if (!startedBy || !startedAt) return null;
  const updates = Array.isArray(value.updates)
    ? value.updates
        .map((update) => normalizeUpdate(update as Partial<TaskProgressUpdate>))
        .filter((update): update is TaskProgressUpdate => Boolean(update))
        .slice(-MAX_PROGRESS_UPDATES)
    : [];
  const entry: TaskProgressEntry = {
    status,
    percent: status === "done" ? 100 : clampPercent(value.percent, 0),
    startedBy,
    startedAt,
    updatedBy: typeof value.updatedBy === "string" ? value.updatedBy : startedBy,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : startedAt,
    updates
  };
  if (typeof value.blockedNote === "string" && value.blockedNote.trim() && status === "stuck") {
    entry.blockedNote = value.blockedNote.trim().slice(0, 400);
  }
  if (status === "done") {
    if (typeof value.doneBy === "string") entry.doneBy = value.doneBy;
    if (typeof value.doneAt === "string") entry.doneAt = value.doneAt;
  }
  return entry;
}

export function normalizeProgressMap(raw: unknown): Record<string, TaskProgressEntry> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, TaskProgressEntry> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const entry = normalizeProgressEntry(value);
    if (entry) out[key] = entry;
  }
  return out;
}

/** ตัดงานเก่าออกเมื่อแผนที่โตเกินลิมิต — เรียงตามเวลาที่แตะล่าสุด เก็บอันใหม่ไว้ */
export function pruneProgressMap(
  map: Record<string, TaskProgressEntry>,
  limit = MAX_PROGRESS_ENTRIES
): Record<string, TaskProgressEntry> {
  const keys = Object.keys(map);
  if (keys.length <= limit) return map;
  const kept = keys
    .sort((a, b) => (map[b].updatedAt || "").localeCompare(map[a].updatedAt || ""))
    .slice(0, limit);
  const out: Record<string, TaskProgressEntry> = {};
  for (const key of kept) out[key] = map[key];
  return out;
}
