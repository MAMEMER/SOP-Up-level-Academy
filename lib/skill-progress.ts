// กติกานับสัปดาห์ของระบบประเมิน skill (คู่มือประเมิน skill รายสัปดาห์ หน้า 1–2). pure ล้วน.
//
// ระบบนี้แค่ "เสนอ" ขึ้น/ลดระดับ — เปลี่ยนระดับจริงเมื่อแอดมินกดยืนยันเท่านั้น และไม่แตะ
// KPI / เงินเดือนใดๆ.

/** ผลรายสัปดาห์ของตัวชี้วัดหนึ่งตัว */
export type SkillWeekResult = "next" | "hold" | "below" | "na";

export const skillResultOptions: Array<{ value: SkillWeekResult; label: string; hint: string }> = [
  { value: "next", label: "ผ่านระดับถัดไป", hint: "นับ 1 สัปดาห์" },
  { value: "hold", label: "คงระดับ", hint: "ไม่นับ ไม่หัก" },
  { value: "below", label: "ต่ำกว่าระดับ", hint: "2 สัปดาห์ติด = เสนอลดระดับ" },
  { value: "na", label: "ไม่ได้ทำ", hint: "ไม่นับ ไม่ทำให้สัปดาห์ติดกันขาด" }
];

export function isSkillWeekResult(value: string): value is SkillWeekResult {
  return value === "next" || value === "hold" || value === "below" || value === "na";
}

/** ตัวเลขทุกตัวของกติกา อยู่ที่เดียว */
export const SKILL_RULES = {
  l2: { need: 4, windowWeeks: 6 },
  l3: { need: 8, windowWeeks: 10, minWeeksAtLevel: 4, cleanWeeks: 8 },
  l4: { minWeeksAtLevel: 12 },
  demote: { consecutiveBelow: 2, belowInWindow: 3, windowWeeks: 6 },
  review: { naWeeks: 4 },
  reviewDeadlineDays: 3
} as const;

export type SkillWeekEntry = {
  /** วันจันทร์ของสัปดาห์ที่ถูกประเมิน */
  weekStart: string;
  result: SkillWeekResult;
  serious?: boolean;
  /** ตัวเสี่ยงสูง: ผู้ประเมินคนที่ 2 ยืนยันแล้ว */
  confirmed?: boolean;
};

export type SkillSuggestion =
  | { kind: "suspend"; text: string }
  | { kind: "demote"; text: string }
  | { kind: "review"; text: string }
  | { kind: "promote"; to: number; text: string }
  | { kind: "none"; text: string };

export type SkillProgress = {
  /** ระดับเป้าหมายถัดไป (null = เต็มแล้ว) */
  target: number | null;
  have: number;
  need: number;
  /** อธิบายความคืบหน้า เช่น "ผ่าน 3/4 สัปดาห์ ใน 6 สัปดาห์ล่าสุด" */
  text: string;
  suggestion: SkillSuggestion;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtc(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function addDays(date: string, days: number): string {
  return new Date(toUtc(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** วันจันทร์ของสัปดาห์ที่ `date` อยู่ (สัปดาห์ จันทร์–อาทิตย์) */
export function mondayOf(date: string): string {
  const day = new Date(toUtc(date)).getUTCDay(); // 0 = อาทิตย์
  return addDays(date, day === 0 ? -6 : 1 - day);
}

/** สัปดาห์ที่ต้องประเมินเมื่อเปิดหน้าในวันนี้ = สัปดาห์ที่แล้ว */
export function reviewWeekFor(today: string): string {
  return addDays(mondayOf(today), -7);
}

/** ประเมินทุกวันจันทร์ ลงผลภายใน 3 วัน → วันพุธหลังสัปดาห์ที่ถูกประเมิน */
export function reviewDeadline(weekStart: string): string {
  return addDays(weekStart, 7 + SKILL_RULES.reviewDeadlineDays - 1);
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

function weeksBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / (7 * DAY_MS));
}

/** entries ที่อยู่ใน `windowWeeks` สัปดาห์ล่าสุด นับถึง asOf (รวม asOf) */
function inWindow(entries: SkillWeekEntry[], asOf: string, windowWeeks: number): SkillWeekEntry[] {
  return entries.filter((entry) => {
    const back = weeksBetween(entry.weekStart, asOf);
    return back >= 0 && back < windowWeeks;
  });
}

/** สัปดาห์ติดกันจากล่าสุดย้อนหลัง — "ไม่ได้ทำ" ข้ามได้ ไม่ทำให้ขาด */
function trailingRun(entries: SkillWeekEntry[], predicate: (entry: SkillWeekEntry) => boolean): number {
  let run = 0;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.result === "na") continue;
    if (!predicate(entry)) break;
    run += 1;
  }
  return run;
}

function trailingNa(entries: SkillWeekEntry[]): number {
  let run = 0;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index].result !== "na") break;
    run += 1;
  }
  return run;
}

export type EvaluateSkillInput = {
  entries: SkillWeekEntry[];
  level: number;
  /** วันที่ได้ระดับปัจจุบัน (YYYY-MM-DD) — นับเฉพาะสัปดาห์ตั้งแต่วันนี้ */
  levelSince?: string;
  highRisk: boolean;
  maxLevel: number;
  /** สัปดาห์อ้างอิง (วันจันทร์) — ปกติคือสัปดาห์ที่กำลังดู */
  asOf: string;
};

export function evaluateSkill(input: EvaluateSkillInput): SkillProgress {
  const { level, highRisk, maxLevel, asOf } = input;
  const all = [...input.entries]
    .filter((entry) => entry.weekStart <= asOf)
    .sort((left, right) => left.weekStart.localeCompare(right.weekStart));
  const sinceWeek = input.levelSince ? mondayOf(input.levelSince) : undefined;
  const atLevel = sinceWeek ? all.filter((entry) => entry.weekStart >= sinceWeek) : all;
  const counts = (entry: SkillWeekEntry) => entry.result === "next" && (!highRisk || Boolean(entry.confirmed));

  // ลดระดับ / ระงับ / ทบทวน มาก่อนข้อเสนอขึ้นระดับ
  const latest = all[all.length - 1];
  let suggestion: SkillSuggestion = { kind: "none", text: "" };
  if (level > 0 && latest && latest.weekStart === asOf && latest.serious) {
    suggestion = { kind: "suspend", text: "ผิดพลาดร้ายแรง/จงใจ → เสนอระงับ + คุยกระบวนการวินัย" };
  } else if (level > 0) {
    const belowRun = trailingRun(atLevel, (entry) => entry.result === "below");
    const belowCount = inWindow(atLevel, asOf, SKILL_RULES.demote.windowWeeks).filter((entry) => entry.result === "below").length;
    if (belowRun >= SKILL_RULES.demote.consecutiveBelow) {
      suggestion = { kind: "demote", text: `ต่ำกว่าระดับ ${belowRun} สัปดาห์ติด → เสนอลดเหลือระดับ ${level - 1}` };
    } else if (belowCount >= SKILL_RULES.demote.belowInWindow) {
      suggestion = { kind: "demote", text: `ต่ำกว่าระดับ ${belowCount} ครั้งใน ${SKILL_RULES.demote.windowWeeks} สัปดาห์ → เสนอลดเหลือระดับ ${level - 1}` };
    } else if (trailingNa(all) > SKILL_RULES.review.naWeeks) {
      suggestion = { kind: "review", text: `ไม่ได้ทำเกิน ${SKILL_RULES.review.naWeeks} สัปดาห์ → ต้องทบทวน (ทำได้เมื่อมีคนตรวจ)` };
    }
  }

  const target = level < maxLevel ? level + 1 : null;
  if (target === null) {
    return { target, have: 0, need: 0, text: "ถึงระดับสูงสุดแล้ว", suggestion };
  }

  const weeksAtLevel = sinceWeek ? weeksBetween(sinceWeek, asOf) + 1 : atLevel.length;
  const riskNote = highRisk ? " (ต้องยืนยัน 2 คน)" : "";
  let have = 0;
  let need = 0;
  let text = "";
  let ready = false;
  let readyNote = "";

  if (target === 1) {
    need = 1;
    have = Math.min(1, atLevel.filter(counts).length);
    text = `ผ่าน ${have}/1 สัปดาห์`;
    ready = have >= need;
    readyNote = " · Hard skill ต้องเรียนครบและสอบผ่าน ≥ 80% ก่อนยืนยัน";
  } else if (target === 2) {
    need = SKILL_RULES.l2.need;
    if (highRisk) {
      have = Math.min(need, trailingRun(atLevel, counts));
      text = `ผ่านติดกัน ${have}/${need} สัปดาห์${riskNote}`;
    } else {
      have = inWindow(atLevel, asOf, SKILL_RULES.l2.windowWeeks).filter(counts).length;
      text = `ผ่าน ${Math.min(have, need)}/${need} สัปดาห์ ใน ${SKILL_RULES.l2.windowWeeks} สัปดาห์ล่าสุด`;
    }
    ready = have >= need;
  } else if (target === 3) {
    need = SKILL_RULES.l3.need;
    have = inWindow(atLevel, asOf, SKILL_RULES.l3.windowWeeks).filter(counts).length;
    const serious = inWindow(all, asOf, SKILL_RULES.l3.cleanWeeks).some((entry) => entry.serious);
    const heldLongEnough = weeksAtLevel >= SKILL_RULES.l3.minWeeksAtLevel;
    text = `ผ่าน ${Math.min(have, need)}/${need} สัปดาห์ ใน ${SKILL_RULES.l3.windowWeeks} สัปดาห์ล่าสุด${riskNote}`;
    if (!heldLongEnough) text += ` · ถือระดับ 2 มา ${weeksAtLevel}/${SKILL_RULES.l3.minWeeksAtLevel} สัปดาห์`;
    if (serious) text += ` · มีผิดพลาดร้ายแรงใน ${SKILL_RULES.l3.cleanWeeks} สัปดาห์ล่าสุด`;
    ready = have >= need && heldLongEnough && !serious;
    readyNote = " · ต้องคุยประเมินเชิงลึก 1 ครั้งก่อนยืนยัน";
  } else {
    need = SKILL_RULES.l4.minWeeksAtLevel;
    have = Math.min(weeksAtLevel, need);
    text = `ถือระดับ 3 มา ${have}/${need} สัปดาห์`;
    ready = weeksAtLevel >= need;
    readyNote = " · ต้องทำโครงการปรับปรุง 1 ชิ้น ผู้บริหาร 2 คนอนุมัติ";
  }

  if (ready && suggestion.kind === "none") {
    suggestion = { kind: "promote", to: target, text: `ครบเกณฑ์ขึ้นระดับ ${target}${readyNote}` };
  }
  return { target, have: Math.min(have, need), need, text, suggestion };
}

/** วันทำงานในสัปดาห์: วันที่มีกะ และวันที่มีกะ + ตอกบัตรจริง (นิยามเดียวกับ KPI) */
export function weekWorkDays(
  weekStart: string,
  staffCode: string,
  schedules: Array<{ employeeName: string; workDate: string }>,
  clockEvents: Array<{ employeeName: string; workDate: string }>
): { planned: number; worked: number } {
  const days = new Set(weekDates(weekStart));
  const planned = new Set(
    schedules.filter((s) => s.employeeName === staffCode && days.has(s.workDate)).map((s) => s.workDate)
  );
  const clocked = new Set(
    clockEvents.filter((c) => c.employeeName === staffCode && days.has(c.workDate)).map((c) => c.workDate)
  );
  let worked = 0;
  for (const day of planned) if (clocked.has(day)) worked += 1;
  return { planned: planned.size, worked };
}
