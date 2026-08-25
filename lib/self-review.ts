// "ประเมินผลงานตัวเอง" — แปลงคะแนน KPI ดิบให้พนักงานอ่านแล้วรู้ว่าจะแก้อะไร
//
// หน้าคะแนนเดิมบอกได้แค่ "เหลือกี่คะแนน" กับลิสต์รายการหักยาวๆ เรียงตามหมวด — พนักงานอ่านแล้ว
// ยังไม่รู้ว่า "แล้วพรุ่งนี้ต้องทำอะไรต่างจากเดิม". ไฟล์นี้จัดข้อมูลชุดเดียวกันใหม่เป็น 3 คำถาม:
//
//   1. ได้คะแนนจากอะไร / เสียคะแนนจากอะไร (แยก + และ − ไม่ปนกัน)
//   2. เรื่องไหนโดนซ้ำบ่อยที่สุด และรวมแล้วเสียไปกี่คะแนน
//   3. ต้องทำอะไรให้ต่างจากเดิม — พร้อมเวลาที่ต้องส่งจริงของหัวข้อที่พลาดบ่อย
//
// pure logic ล้วน (ไม่แตะ network/Date) — เวลาและ deadline ส่งเข้ามาทางพารามิเตอร์.

import type { DeductionRecord, EmployeePerformanceScore, ScoreCategoryKey } from "./performance-score.ts";
import { deductionCategoryLabel } from "./staff-view.ts";

/** หนึ่งบรรทัดใน "ได้/เสียคะแนนจากอะไร" — points เป็นจำนวนคะแนนจริง (บวก = ได้, ลบ = เสีย) */
export type SelfReviewEvent = {
  category: ScoreCategoryKey;
  categoryLabel: string;
  /** + ได้คะแนน · − เสียคะแนน */
  points: number;
  reason: string;
  detail: string;
};

/** เรื่องที่โดนหักซ้ำ — รวมทุกครั้งของเหตุผลเดียวกันไว้ก้อนเดียว */
export type SelfReviewOffence = {
  reason: string;
  category: ScoreCategoryKey;
  categoryLabel: string;
  /** ชื่อที่คนอ่านรู้เรื่อง */
  label: string;
  /** โดนกี่ครั้งในรอบนี้ */
  times: number;
  /** เสียไปทั้งหมดกี่คะแนน (จำนวนบวก) */
  points: number;
  /** ทำยังไงไม่ให้โดนอีก */
  advice: string;
  /** เวลาที่ต้องส่งจริง ถ้าเรื่องนี้ผูกกับ deadline */
  dueLabel?: string;
};

export type SelfReviewCategory = {
  key: ScoreCategoryKey;
  label: string;
  score: number;
  maxScore: number;
  lostPoints: number;
};

export type SelfReview = {
  hasData: boolean;
  totalScore: number;
  /** รวมคะแนนที่ได้เพิ่ม/ได้คืนในรอบนี้ */
  gainedPoints: number;
  /** รวมคะแนนที่เสียไปในรอบนี้ */
  lostPoints: number;
  gains: SelfReviewEvent[];
  losses: SelfReviewEvent[];
  /** เรียงจากเสียคะแนนมากสุด → น้อยสุด */
  offences: SelfReviewOffence[];
  categories: SelfReviewCategory[];
  /** 3 อันดับแรกที่ควรแก้ก่อน */
  focus: SelfReviewOffence[];
  /** ประโยคสรุปหัวหน้าหน้า */
  headline: string;
};

const CATEGORY_ORDER: Array<{ key: ScoreCategoryKey; field: keyof EmployeePerformanceScore["categories"] }> = [
  { key: "attendance", field: "attendance" },
  { key: "stock", field: "stock" },
  { key: "checklist", field: "checklist" },
  { key: "customer_service", field: "customerService" },
  { key: "assigned_work", field: "assignedWork" }
];

/** ชื่อเรื่องที่คนอ่านรู้เรื่อง — key คือ reason ที่ KPI engine เขียนไว้ */
const REASON_LABEL: Record<string, string> = {
  late_over_30_minutes_or_missing_clock_in: "เข้างานสาย 30 นาทีขึ้นไป / ไม่มีบันทึกตอกบัตร",
  late_over_10_minutes: "เข้างานสายเกิน 10 นาที",
  late_within_10_minutes: "เข้างานสายไม่เกิน 10 นาที",
  stock_not_counted: "ไม่ได้นับ stock ตามรอบ",
  stock_slow_count: "นับ stock ช้ากว่าเวลาที่กำหนด",
  stock_difference: "ของขาด/เกินจากที่ระบบมี",
  missing_day: "ไม่ได้ส่ง checklist ทั้งวัน",
  missing_important: "ไม่ได้ทำหัวข้อสำคัญใน checklist",
  late_submit: "ส่ง checklist ช้ากว่ากำหนด",
  backfilled: "ส่ง checklist ย้อนหลัง",
  false_record: "ติ๊ก checklist ไม่ตรงกับงานจริง",
  early_quality: "ส่งงานก่อนกำหนดและผ่าน",
  on_time: "ส่งงานตรงเวลา",
  needs_revision: "งานที่มอบหมายต้องแก้ไข",
  late_one_day: "ส่งงานที่มอบหมายช้า",
  not_finished: "งานที่มอบหมายไม่เสร็จตามกำหนด",
  manual_credit: "หัวหน้าคืนคะแนนให้",
  manual_deduction: "หัวหน้าหักคะแนนเพิ่ม",
  feedback_fixed_immediately: "ลูกค้าติ แต่แก้ได้ทันที",
  feedback_repeated: "ลูกค้าติเรื่องเดิมซ้ำ",
  feedback_severe: "ลูกค้าติเรื่องรุนแรง",
  event_response_fixed_immediately: "งานกิจกรรมพลาด แต่แก้ทัน",
  event_response_repeated: "งานกิจกรรมพลาดซ้ำ",
  event_response_severe: "งานกิจกรรมพลาดรุนแรง"
};

/** ทำยังไงไม่ให้โดนอีก — เขียนเป็นการกระทำที่ทำได้พรุ่งนี้เลย ไม่ใช่คำตำหนิ */
const REASON_ADVICE: Record<string, string> = {
  late_over_30_minutes_or_missing_clock_in:
    "ตอกบัตรใน StoreHub ทันทีที่ถึงร้าน ก่อนทำอย่างอื่น — ถ้าลืมตอก ระบบอ่านว่าไม่มาทั้งวัน แจ้งหัวหน้าวันนั้นเลยเพื่อแก้บันทึก",
  late_over_10_minutes: "ตั้งเป้าถึงร้านก่อนเวลาเข้ากะ 15 นาที เผื่อรถติด แล้วตอกบัตรทันทีที่ถึง",
  late_within_10_minutes: "ออกจากบ้านเผื่ออีก 10 นาที — สายไม่เกิน 10 นาทีก็ยังโดนหัก",
  stock_not_counted: "รอบนับ stock เป็นงานที่ต้องปิดให้จบในกะ ถ้ารอบนี้นับไม่ทันให้แจ้งหัวหน้าก่อนหมดกะ อย่าปล่อยข้ามวัน",
  stock_slow_count: "เริ่มนับ stock ตั้งแต่ต้นกะ อย่ารอช่วงลูกค้าเยอะ — เริ่มช้าคือจบช้าและถูกหักทุกครั้ง",
  stock_difference: "นับซ้ำอีกรอบก่อนกดส่ง และถ้าตัวเลขไม่ตรง ให้รายงานทันทีในวันนั้น (แก้ได้ใน 24 ชม. หักน้อยกว่ามาก)",
  missing_day: "วันไหนเข้ากะต้องส่ง checklist เสมอ ทำไม่ครบก็กดส่งเท่าที่ทำ — ไม่ส่งเลยเสียคะแนนหนักที่สุด",
  missing_important: "หัวข้อที่ติดดาวคือหัวข้อที่ห้ามข้าม เคลียร์ให้จบก่อนหมดกะ",
  late_submit: "กดส่งแต่ละหัวข้อทันทีที่ทำเสร็จ อย่ารวบไปกดตอนท้ายกะ",
  backfilled: "ติ๊ก checklist ตอนทำจริง ไม่ใช่ย้อนหลังวันถัดไป",
  false_record: "ติ๊กเฉพาะสิ่งที่ทำจริงและแนบหลักฐานให้ตรง — ข้อนี้ถือเป็นเรื่องร้ายแรงและต้องคุยกับหัวหน้า",
  needs_revision: "อ่านช่อง “งานเสร็จคือ” ให้ครบก่อนส่ง แล้วเช็คทีละข้อ — ส่งครั้งเดียวผ่านไม่เสียคะแนน",
  late_one_day: "งานที่มอบหมายให้ลงมือวันแรกที่ได้รับ อย่ารอวันสุดท้าย ติดอะไรให้บอกหัวหน้าก่อนถึงกำหนด",
  not_finished: "ถ้ารู้ว่าไม่ทันต้องบอกก่อนถึงกำหนด (ส่งต่องานให้กะถัดไปได้) — ปล่อยเงียบเสียคะแนนหนักสุดในหมวดนี้",
  manual_deduction: "อ่านเหตุผลที่หัวหน้าเขียนไว้ ถ้าไม่เห็นด้วยให้คุยกับหัวหน้าในรอบนี้เลย",
  feedback_repeated: "เรื่องที่ลูกค้าติซ้ำ ให้จดไว้แล้วเปลี่ยนวิธีทำ ไม่ใช่แก้เป็นครั้งๆ",
  feedback_severe: "เคสรุนแรงต้องรายงานหัวหน้าทันทีในวันนั้น",
  event_response_repeated: "งานกิจกรรมที่พลาดซ้ำ ให้ทำเช็คลิสต์ของตัวเองก่อนเริ่มงานทุกครั้ง",
  event_response_severe: "งานกิจกรรมที่พลาดหนักต้องแจ้งหัวหน้าทันที อย่าแก้เงียบ"
};

const DEFAULT_ADVICE = "ดูรายละเอียดของรายการนี้แล้วคุยกับหัวหน้าว่าจะแก้ยังไงในรอบหน้า";

export function reasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? reason;
}

export function reasonAdvice(reason: string): string {
  return REASON_ADVICE[reason] ?? DEFAULT_ADVICE;
}

/** หัวข้อ checklist ที่คนนี้ส่งช้าบ่อยที่สุด — ใช้เติมเวลาจริงลงในคำแนะนำ */
export type LateChecklistFocus = { phaseId: string; title: string; times: number; dueLabel: string };

export function topLateChecklistPhase(
  lateSubmissions: Array<{ phaseId: string }>,
  meta: (phaseId: string) => { title: string; dueLabel: string } | null
): LateChecklistFocus | null {
  const counts = new Map<string, number>();
  for (const item of lateSubmissions) counts.set(item.phaseId, (counts.get(item.phaseId) || 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const [phaseId, times] of ranked) {
    const info = meta(phaseId);
    if (info) return { phaseId, title: info.title, times, dueLabel: info.dueLabel };
  }
  return null;
}

export type SelfReviewContext = {
  /** หัวข้อ checklist ที่ส่งช้าบ่อยสุด (ถ้ามี) — เอาไว้บอกเวลาที่ต้องส่งจริง */
  lateChecklist?: LateChecklistFocus | null;
};

function toEvent(deduction: DeductionRecord): SelfReviewEvent {
  return {
    category: deduction.category,
    categoryLabel: deductionCategoryLabel(deduction.category),
    // DeductionRecord.points เป็น "จำนวนที่หัก" (บวก = หัก) — พลิกให้เป็นคะแนนจริงที่คนอ่านเข้าใจ
    points: -deduction.points,
    reason: deduction.reason,
    detail: deduction.detail || reasonLabel(deduction.reason)
  };
}

/** รวมรายการหักที่เหตุผลเดียวกันเป็นก้อนเดียว เรียงจากเสียมากไปน้อย */
export function groupOffences(deductions: DeductionRecord[], context: SelfReviewContext = {}): SelfReviewOffence[] {
  const grouped = new Map<string, SelfReviewOffence>();
  for (const deduction of deductions) {
    if (deduction.points <= 0) continue; // ไม่ใช่การหัก (คืนคะแนน) — ไม่ใช่เรื่องที่ต้องแก้
    const key = `${deduction.category}:${deduction.reason}`;
    // หนึ่งบรรทัดอาจรวมหลายครั้งไว้แล้ว (เช่น "ส่งช้า x 28 หัวข้อ") — ใช้ count จริงเสมอ
    const times = Math.max(1, Math.round(deduction.count ?? 1));
    const existing = grouped.get(key);
    if (existing) {
      existing.times += times;
      existing.points += deduction.points;
      continue;
    }
    const isLateChecklist = deduction.reason === "late_submit" && context.lateChecklist;
    grouped.set(key, {
      reason: deduction.reason,
      category: deduction.category,
      categoryLabel: deductionCategoryLabel(deduction.category),
      label: reasonLabel(deduction.reason),
      times,
      points: deduction.points,
      advice: isLateChecklist
        ? `${reasonAdvice(deduction.reason)} — หัวข้อที่ช้าบ่อยสุดคือ “${context.lateChecklist!.title}” (ช้า ${context.lateChecklist!.times} ครั้ง) ต้องกดส่งก่อน ${context.lateChecklist!.dueLabel}`
        : reasonAdvice(deduction.reason),
      ...(isLateChecklist ? { dueLabel: context.lateChecklist!.dueLabel } : {})
    });
  }
  return [...grouped.values()].sort((a, b) => b.points - a.points || b.times - a.times);
}

function headlineFor(input: { hasData: boolean; totalScore: number; offences: SelfReviewOffence[]; gainedPoints: number }): string {
  if (!input.hasData) return "รอบนี้ยังไม่มีข้อมูลการทำงาน — คะแนนจะเริ่มนับเมื่อขึ้นตารางกะและเริ่มส่งงาน";
  if (input.offences.length === 0) {
    return `รอบนี้ยังไม่โดนหักเลย ${input.totalScore}/100 — รักษาไว้แบบนี้`;
  }
  const top = input.offences[0];
  return `รอบนี้ ${input.totalScore}/100 · เสียคะแนนมากที่สุดจาก “${top.label}” ${top.times} ครั้ง รวม ${top.points} คะแนน`;
}

export function buildSelfReview(row: EmployeePerformanceScore, context: SelfReviewContext = {}): SelfReview {
  const events = row.deductions.map(toEvent);
  const gains = events.filter((event) => event.points > 0).sort((a, b) => b.points - a.points);
  const losses = events.filter((event) => event.points < 0).sort((a, b) => a.points - b.points);
  const offences = groupOffences(row.deductions, context);
  const categories: SelfReviewCategory[] = CATEGORY_ORDER.map(({ key, field }) => {
    const result = row.categories[field];
    return {
      key,
      label: deductionCategoryLabel(key),
      score: result.score,
      maxScore: result.maxScore,
      lostPoints: offences.filter((offence) => offence.category === key).reduce((sum, offence) => sum + offence.points, 0)
    };
  });
  const gainedPoints = gains.reduce((sum, event) => sum + event.points, 0);
  const lostPoints = losses.reduce((sum, event) => sum + Math.abs(event.points), 0);

  return {
    hasData: row.hasData,
    totalScore: row.totalScore,
    gainedPoints,
    lostPoints,
    gains,
    losses,
    offences,
    categories,
    focus: offences.slice(0, 3),
    headline: headlineFor({ hasData: row.hasData, totalScore: row.totalScore, offences, gainedPoints })
  };
}
