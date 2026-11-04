// กติกานับรอบของระบบประเมิน skill (คู่มือประเมิน skill หน้า 1–2). pure ล้วน.
// ประเมินทุก 2 สัปดาห์ (เนม 4 พ.ย. 2569): 1 รอบ = จันทร์–อาทิตย์ 2 สัปดาห์ เริ่มนับจาก PERIOD_ANCHOR.
// ระยะเวลาในคู่มือเดิม (เช่น 4 ใน 6 สัปดาห์) แปลงเป็นรอบโดยคงจำนวนสัปดาห์รวมเท่าเดิม.
//
// ระบบนี้แค่ "เสนอ" ขึ้น/ลดระดับ — เปลี่ยนระดับจริงเมื่อแอดมินกดยืนยันเท่านั้น และไม่แตะ
// KPI / เงินเดือนใดๆ.

/** ผลของรอบ (2 สัปดาห์) ของตัวชี้วัดหนึ่งตัว */
export type SkillWeekResult = "next" | "hold" | "below" | "na";

export const skillResultOptions: Array<{ value: SkillWeekResult; label: string; hint: string }> = [
  { value: "next", label: "ผ่านระดับถัดไป", hint: "นับ 1 รอบ" },
  { value: "hold", label: "คงระดับ", hint: "ไม่นับ ไม่หัก" },
  { value: "below", label: "ต่ำกว่าระดับ", hint: "2 รอบติด = เสนอลดระดับ" },
  { value: "na", label: "ไม่ได้ทำ", hint: "ไม่นับ ไม่ทำให้รอบติดกันขาด" }
];

export function isSkillWeekResult(value: string): value is SkillWeekResult {
  return value === "next" || value === "hold" || value === "below" || value === "na";
}

/** 1 รอบประเมิน = 14 วัน */
export const PERIOD_DAYS = 14;
/** วันจันทร์แรกของรอบที่ 1 — รอบถัดไปเริ่มทุก 14 วันจากวันนี้ */
export const PERIOD_ANCHOR = "2026-10-26";

/** ตัวเลขทุกตัวของกติกา อยู่ที่เดียว (หน่วย = รอบ, 1 รอบ = 2 สัปดาห์) */
export const SKILL_RULES = {
  l2: { need: 2, windowPeriods: 3 },
  l3: { need: 4, windowPeriods: 5, minPeriodsAtLevel: 2, cleanPeriods: 4 },
  l4: { minPeriodsAtLevel: 6 },
  demote: { consecutiveBelow: 2, belowInWindow: 2, windowPeriods: 3 },
  review: { naPeriods: 2 },
  reviewDeadlineDays: 3
} as const;

export type SkillWeekEntry = {
  /** วันจันทร์แรกของรอบที่ถูกประเมิน */
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
  /** อธิบายความคืบหน้า เช่น "ผ่าน 1/2 รอบ ใน 3 รอบล่าสุด" */
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

/** จำนวนรอบจาก `from` ถึง `to` (ทั้งคู่เป็นวันเริ่มรอบ) */
function periodsBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / (PERIOD_DAYS * DAY_MS));
}

/** วันเริ่มรอบ (จันทร์) ของรอบที่ `date` อยู่ */
export function periodStartOf(date: string): string {
  const monday = mondayOf(date);
  const weeks = Math.round((toUtc(monday) - toUtc(PERIOD_ANCHOR)) / (7 * DAY_MS));
  return ((weeks % 2) + 2) % 2 === 0 ? monday : addDays(monday, -7);
}

/** รอบที่ต้องประเมินเมื่อเปิดหน้าในวันนี้ = รอบที่จบไปล่าสุด */
export function reviewPeriodFor(today: string): string {
  return addDays(periodStartOf(today), -PERIOD_DAYS);
}

/** ประเมินวันจันทร์หลังจบรอบ ลงผลภายใน 3 วัน → วันพุธหลังรอบที่ถูกประเมิน */
export function reviewDeadline(periodStart: string): string {
  return addDays(periodStart, PERIOD_DAYS + SKILL_RULES.reviewDeadlineDays - 1);
}

export function periodDates(periodStart: string): string[] {
  return Array.from({ length: PERIOD_DAYS }, (_, index) => addDays(periodStart, index));
}

/** entries ที่อยู่ใน `windowPeriods` รอบล่าสุด นับถึง asOf (รวม asOf) */
function inWindow(entries: SkillWeekEntry[], asOf: string, windowPeriods: number): SkillWeekEntry[] {
  return entries.filter((entry) => {
    const back = periodsBetween(entry.weekStart, asOf);
    return back >= 0 && back < windowPeriods;
  });
}

/** รอบติดกันจากล่าสุดย้อนหลัง — "ไม่ได้ทำ" ข้ามได้ ไม่ทำให้ขาด */
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
  /** วันที่ได้ระดับปัจจุบัน (YYYY-MM-DD) — นับเฉพาะรอบตั้งแต่วันนี้ */
  levelSince?: string;
  highRisk: boolean;
  maxLevel: number;
  /** รอบอ้างอิง (วันเริ่มรอบ) — ปกติคือรอบที่กำลังดู */
  asOf: string;
};

export function evaluateSkill(input: EvaluateSkillInput): SkillProgress {
  const { level, highRisk, maxLevel, asOf } = input;
  const all = [...input.entries]
    .filter((entry) => entry.weekStart <= asOf)
    .sort((left, right) => left.weekStart.localeCompare(right.weekStart));
  const sinceWeek = input.levelSince ? periodStartOf(input.levelSince) : undefined;
  const atLevel = sinceWeek ? all.filter((entry) => entry.weekStart >= sinceWeek) : all;
  const counts = (entry: SkillWeekEntry) => entry.result === "next" && (!highRisk || Boolean(entry.confirmed));

  // ลดระดับ / ระงับ / ทบทวน มาก่อนข้อเสนอขึ้นระดับ
  const latest = all[all.length - 1];
  let suggestion: SkillSuggestion = { kind: "none", text: "" };
  if (level > 0 && latest && latest.weekStart === asOf && latest.serious) {
    suggestion = { kind: "suspend", text: "ผิดพลาดร้ายแรง/จงใจ → เสนอระงับ + คุยกระบวนการวินัย" };
  } else if (level > 0) {
    const belowRun = trailingRun(atLevel, (entry) => entry.result === "below");
    const belowCount = inWindow(atLevel, asOf, SKILL_RULES.demote.windowPeriods).filter((entry) => entry.result === "below").length;
    if (belowRun >= SKILL_RULES.demote.consecutiveBelow) {
      suggestion = { kind: "demote", text: `ต่ำกว่าระดับ ${belowRun} รอบติด → เสนอลดเหลือระดับ ${level - 1}` };
    } else if (belowCount >= SKILL_RULES.demote.belowInWindow) {
      suggestion = { kind: "demote", text: `ต่ำกว่าระดับ ${belowCount} ครั้งใน ${SKILL_RULES.demote.windowPeriods} รอบล่าสุด → เสนอลดเหลือระดับ ${level - 1}` };
    } else if (trailingNa(all) > SKILL_RULES.review.naPeriods) {
      suggestion = { kind: "review", text: `ไม่ได้ทำเกิน ${SKILL_RULES.review.naPeriods} รอบ → ต้องทบทวน (ทำได้เมื่อมีคนตรวจ)` };
    }
  }

  const target = level < maxLevel ? level + 1 : null;
  if (target === null) {
    return { target, have: 0, need: 0, text: "ถึงระดับสูงสุดแล้ว", suggestion };
  }

  const periodsAtLevel = sinceWeek ? periodsBetween(sinceWeek, asOf) + 1 : atLevel.length;
  const riskNote = highRisk ? " (ต้องยืนยัน 2 คน)" : "";
  let have = 0;
  let need = 0;
  let text = "";
  let ready = false;
  let readyNote = "";

  if (target === 1) {
    need = 1;
    have = Math.min(1, atLevel.filter(counts).length);
    text = `ผ่าน ${have}/1 รอบ`;
    ready = have >= need;
    readyNote = " · Hard skill ต้องเรียนครบและสอบผ่าน ≥ 80% ก่อนยืนยัน";
  } else if (target === 2) {
    need = SKILL_RULES.l2.need;
    if (highRisk) {
      have = Math.min(need, trailingRun(atLevel, counts));
      text = `ผ่านติดกัน ${have}/${need} รอบ${riskNote}`;
    } else {
      have = inWindow(atLevel, asOf, SKILL_RULES.l2.windowPeriods).filter(counts).length;
      text = `ผ่าน ${Math.min(have, need)}/${need} รอบ ใน ${SKILL_RULES.l2.windowPeriods} รอบล่าสุด`;
    }
    ready = have >= need;
  } else if (target === 3) {
    need = SKILL_RULES.l3.need;
    have = inWindow(atLevel, asOf, SKILL_RULES.l3.windowPeriods).filter(counts).length;
    const serious = inWindow(all, asOf, SKILL_RULES.l3.cleanPeriods).some((entry) => entry.serious);
    const heldLongEnough = periodsAtLevel >= SKILL_RULES.l3.minPeriodsAtLevel;
    text = `ผ่าน ${Math.min(have, need)}/${need} รอบ ใน ${SKILL_RULES.l3.windowPeriods} รอบล่าสุด${riskNote}`;
    if (!heldLongEnough) text += ` · ถือระดับ 2 มา ${periodsAtLevel}/${SKILL_RULES.l3.minPeriodsAtLevel} รอบ`;
    if (serious) text += ` · มีผิดพลาดร้ายแรงใน ${SKILL_RULES.l3.cleanPeriods} รอบล่าสุด`;
    ready = have >= need && heldLongEnough && !serious;
    readyNote = " · ต้องคุยประเมินเชิงลึก 1 ครั้งก่อนยืนยัน";
  } else {
    need = SKILL_RULES.l4.minPeriodsAtLevel;
    have = Math.min(periodsAtLevel, need);
    text = `ถือระดับ 3 มา ${have}/${need} รอบ`;
    ready = periodsAtLevel >= need;
    readyNote = " · ต้องทำโครงการปรับปรุง 1 ชิ้น ผู้บริหาร 2 คนอนุมัติ";
  }

  if (ready && suggestion.kind === "none") {
    suggestion = { kind: "promote", to: target, text: `ครบเกณฑ์ขึ้นระดับ ${target}${readyNote}` };
  }
  return { target, have: Math.min(have, need), need, text, suggestion };
}

/** วันทำงานในรอบ (2 สัปดาห์): วันที่มีกะ และวันที่มีกะ + ตอกบัตรจริง (นิยามเดียวกับ KPI) */
export function periodWorkDays(
  periodStart: string,
  staffCode: string,
  schedules: Array<{ employeeName: string; workDate: string }>,
  clockEvents: Array<{ employeeName: string; workDate: string }>
): { planned: number; worked: number } {
  const days = new Set(periodDates(periodStart));
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
