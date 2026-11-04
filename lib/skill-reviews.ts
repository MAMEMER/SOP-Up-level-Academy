// รูปข้อมูลผลประเมิน skill ทุก 2 สัปดาห์ (weekStart = วันจันทร์แรกของรอบ) + ระดับของพนักงาน. pure ล้วน (เทสต์ได้) —
// การอ่าน/เขียนจริงอยู่ที่ lib/skill-review-store.ts.
//
// แยกจาก KPI ทั้งหมด: ไม่มีฟิลด์คะแนน ไม่มีเงิน และไม่มีอะไรถูกส่งเข้า performance-score.

import { isSkillWeekResult, type SkillWeekEntry, type SkillWeekResult } from "./skill-progress.ts";
import { skillIndicatorById } from "./skill-indicators.ts";

export const SKILL_REVIEWS_COLLECTION = "sop_skill_reviews";
export const SKILL_LEVELS_COLLECTION = "sop_skill_levels";

export type SkillResultEntry = {
  result: SkillWeekResult;
  note: string;
  serious?: boolean;
  by: string;
  at: string;
  confirmedBy?: string;
  confirmedAt?: string;
};

export type SkillEdit = {
  indicatorId: string;
  from: SkillWeekResult;
  to: SkillWeekResult;
  by: string;
  at: string;
};

export type SkillReviewRecord = {
  id: string;
  weekStart: string;
  staffCode: string;
  /** snapshot วันทำงานตอนลงผล */
  workDays?: { planned: number; worked: number };
  results: Record<string, SkillResultEntry>;
  /** ต่อท้ายอย่างเดียว — เปลี่ยนผลที่ลงไปแล้ว */
  edits: SkillEdit[];
  updatedAt: string;
};

export type SkillLevelState = { level: number; since: string };

export type SkillLevelHistory = {
  indicatorId: string;
  from: number;
  to: number;
  date: string;
  reason: string;
  by: string;
};

export type SkillLevelsRecord = {
  staffCode: string;
  levels: Record<string, SkillLevelState>;
  /** ต่อท้ายอย่างเดียว */
  history: SkillLevelHistory[];
  updatedAt: string;
};

export function skillReviewId(weekStart: string, staffCode: string): string {
  return `${weekStart}__${staffCode}`;
}

export type SkillResultInput = {
  indicatorId: string;
  result: string;
  note: string;
  serious: boolean;
};

/**
 * รวมผลที่กรอกใหม่เข้ากับของเดิม. แถวที่ผลไม่เปลี่ยนและหมายเหตุไม่เปลี่ยนคงของเดิมไว้ทั้งหมด
 * (รวมการยืนยันของคนที่ 2). ถ้าผลเปลี่ยน → บันทึกลง edits และล้างการยืนยัน (ต้องยืนยันใหม่).
 */
export function mergeSkillReview(
  existing: SkillReviewRecord | undefined,
  input: {
    weekStart: string;
    staffCode: string;
    rows: SkillResultInput[];
    workDays?: { planned: number; worked: number };
    by: string;
    at: string;
  }
): SkillReviewRecord {
  const results: Record<string, SkillResultEntry> = { ...(existing?.results || {}) };
  const edits: SkillEdit[] = [...(existing?.edits || [])];

  for (const row of input.rows) {
    if (!skillIndicatorById(row.indicatorId) || !isSkillWeekResult(row.result)) continue;
    const note = row.note.trim();
    const before = results[row.indicatorId];
    if (before && before.result === row.result && before.note === note && Boolean(before.serious) === row.serious) continue;
    if (before && before.result !== row.result) {
      edits.push({ indicatorId: row.indicatorId, from: before.result, to: row.result, by: input.by, at: input.at });
    }
    const keepConfirm = before && before.result === row.result && Boolean(before.serious) === row.serious;
    const entry: SkillResultEntry = { result: row.result, note, by: input.by, at: input.at };
    if (row.serious) entry.serious = true;
    if (keepConfirm && before.confirmedBy) {
      entry.confirmedBy = before.confirmedBy;
      if (before.confirmedAt) entry.confirmedAt = before.confirmedAt;
    }
    results[row.indicatorId] = entry;
  }

  const record: SkillReviewRecord = {
    id: skillReviewId(input.weekStart, input.staffCode),
    weekStart: input.weekStart,
    staffCode: input.staffCode,
    results,
    edits,
    updatedAt: input.at
  };
  const workDays = input.workDays || existing?.workDays;
  if (workDays) record.workDays = workDays;
  return record;
}

/** ผู้ประเมินคนที่ 2 ยืนยันตัวเสี่ยงสูง — คนเดียวกับคนลงผลยืนยันเองไม่ได้ */
export function confirmSkillResult(
  record: SkillReviewRecord,
  indicatorId: string,
  by: string,
  at: string
): SkillReviewRecord | null {
  const entry = record.results[indicatorId];
  if (!entry || entry.by === by || entry.confirmedBy) return null;
  return {
    ...record,
    results: { ...record.results, [indicatorId]: { ...entry, confirmedBy: by, confirmedAt: at } },
    updatedAt: at
  };
}

/** ประวัติรายรอบของตัวชี้วัดหนึ่งตัว สำหรับ evaluateSkill */
export function skillEntriesFor(records: SkillReviewRecord[], staffCode: string, indicatorId: string): SkillWeekEntry[] {
  return records
    .filter((record) => record.staffCode === staffCode && record.results[indicatorId])
    .map((record) => {
      const entry = record.results[indicatorId];
      return {
        weekStart: record.weekStart,
        result: entry.result,
        serious: Boolean(entry.serious),
        confirmed: Boolean(entry.confirmedBy)
      };
    })
    .sort((left, right) => left.weekStart.localeCompare(right.weekStart));
}

/** ตั้งระดับใหม่ + ต่อท้ายประวัติ (ไม่แก้ประวัติเดิม) */
export function setSkillLevel(
  existing: SkillLevelsRecord | undefined,
  input: { staffCode: string; indicatorId: string; level: number; date: string; reason: string; by: string; at: string }
): SkillLevelsRecord | null {
  const indicator = skillIndicatorById(input.indicatorId);
  if (!indicator) return null;
  const max = indicator.group === "hard" ? 4 : 3;
  const level = Math.max(0, Math.min(max, Math.round(input.level)));
  const levels = { ...(existing?.levels || {}) };
  const from = levels[input.indicatorId]?.level ?? 0;
  if (from === level && levels[input.indicatorId]) return null;
  levels[input.indicatorId] = { level, since: input.date };
  return {
    staffCode: input.staffCode,
    levels,
    history: [
      ...(existing?.history || []),
      { indicatorId: input.indicatorId, from, to: level, date: input.date, reason: input.reason.trim(), by: input.by }
    ],
    updatedAt: input.at
  };
}
