// KPI "งานที่มอบหมาย" — เชื่อมระบบส่งงานโปรเจกต์ (lib/work-projects.ts) เข้ากับคะแนนพนักงาน
// รายคน โดยตรง. เดิมเจ้าของร้านต้องมานั่งลงคะแนนหมวดนี้เอง — ตอนนี้พอกดยืนยันผลตรวจงานในหน้า
// /admin/projects แล้ว คะแนนจะไหลเข้า KPI ให้อัตโนมัติ (ผ่าน channel เดียวกับ score-adjustments).
//
// กติกาการให้คะแนน (คิดแยกรายคนตามรายชื่อผู้รับมอบหมายในงาน — ไม่ใช่คิดรวมเป็นก้อนเดียว):
//   1. เสร็จก่อนกำหนด และไม่ต้องแก้ไข (owner กดผ่าน)      → +1 / คน
//   2. เสร็จตรงเวลา และไม่ต้องแก้ไข (owner กดผ่าน)        →  0 / คน
//   3. ส่งในกำหนด แต่ต้องแก้ไข (owner กดให้แก้)           → −1 ทันที + ตั้งกำหนดใหม่
//        - แก้ทันกำหนดใหม่ แล้ว owner กดผ่าน               → +1 คืน (สุทธิ = 0)
//        - แก้ไม่ทัน                                       → เข้ากติกาช้ากว่ากำหนด (ข้อ 4)
//   4. ช้ากว่ากำหนด (เดิม หรือกำหนดใหม่)                   → −3 / วัน / คน
//        นับตั้งแต่วันถัดจากกำหนดส่ง จนกว่าจะส่งงานและ owner กดผ่าน
//
// ไฟล์นี้เป็น pure logic ล้วน (คิดเลข + สถานะ) — ไม่แตะ network ให้ unit-test ได้ตรงๆ.
// การเขียน ledger จริงทำที่ /api/work-projects (Admin SDK, ตัวตนจาก session).

import { displayNameFor } from "./employee-directory.ts";
import { lateDaysByOwner } from "./project-handover.ts";
import type { ScoreAdjustment } from "./score-adjustments.ts";
import { daysBetween, projectMode, type ProjectReviewEntry, type ProjectReviewOutcome, type WorkProject } from "./work-projects.ts";

/** อัตราคะแนนตามสเปก (ใบงาน a2UXTOpQ) — override ได้เผื่ออนาคตย้ายไป /admin/kpi-rules */
export const PROJECT_SCORE = {
  /** +1 เสร็จก่อนกำหนดและไม่ต้องแก้ */
  earlyBonus: 1,
  /** −1 ต้องแก้ไข (คืน +1 ถ้าแก้ทันกำหนดใหม่) */
  revisionPenalty: 1,
  /** −3 ต่อวันที่ล่าช้า */
  latePerDay: 3
} as const;

export type ProjectScoreRates = { earlyBonus: number; revisionPenalty: number; latePerDay: number };

// ---- ผลตรวจ 1 ครั้ง -----------------------------------------------------------

export type ReviewVerdictInput = {
  /** owner กด "ยืนยันผ่าน" หรือ "ให้แก้ไข" */
  verdict: "approve" | "request_fix";
  /** กำหนดส่งที่มีผล ณ ตอนตรวจ (เดิม หรือกำหนดใหม่กรณีตีกลับ) — YYYY-MM-DD */
  dueDate: string;
  /** วันที่ส่งงานจริง (ใช้ตอน approve) — YYYY-MM-DD */
  submittedDate?: string;
  /** งานนี้เคยถูกสั่งแก้มาก่อนไหม — ถ้าใช่ approve = คืนแต้ม ไม่ใช่ +1 ก่อนกำหนด */
  hadRevision: boolean;
};

export type ReviewComputation = { outcome: ProjectReviewOutcome; points: number; daysLate: number };

/**
 * คิดคะแนนของผลตรวจ 1 ครั้ง — ใช้ทั้งฝั่ง server (ตัวจริง) และ UI (พรีวิวก่อนกด).
 * daysLate เริ่มนับวันถัดจากกำหนดส่ง (ส่งเลยมา 1 วัน = daysLate 1 = −3).
 */
export function computeReviewPoints(input: ReviewVerdictInput, rates: ProjectScoreRates = PROJECT_SCORE): ReviewComputation {
  if (input.verdict === "request_fix") {
    return { outcome: "needs_fix", points: -Math.abs(rates.revisionPenalty), daysLate: 0 };
  }
  const submitted = input.submittedDate || input.dueDate;
  const lateDays = daysBetween(input.dueDate, submitted); // ส่งจริง − กำหนด
  if (lateDays > 0) {
    return { outcome: "late", points: -Math.abs(rates.latePerDay) * lateDays, daysLate: lateDays };
  }
  if (input.hadRevision) {
    // แก้ทันกำหนดใหม่ แล้วผ่าน → คืนแต้มที่หักไปตอนสั่งแก้ (สุทธิ = 0)
    return { outcome: "fixed_pass", points: Math.abs(rates.revisionPenalty), daysLate: 0 };
  }
  if (lateDays < 0) return { outcome: "early_pass", points: Math.abs(rates.earlyBonus), daysLate: 0 };
  return { outcome: "ontime_pass", points: 0, daysLate: 0 };
}

/**
 * ผลตรวจ 1 ครั้ง แตกเป็นรายการรายคนตาม "ใครถือครองงานในวันที่ล่าช้าวันนั้น" (ใบงาน iDBqn3jE).
 *
 * งานที่ไม่เคยส่งต่อจะได้รายการเดียวของคนที่ถูกตรวจ — ผลลัพธ์เท่าเดิมทุกประการ. งานที่ส่งต่อแล้ว
 * และส่งช้า จะหักคนละส่วนตามจำนวนวันที่แต่ละคนถือครองจริง แทนที่จะเทให้คนสุดท้ายคนเดียว.
 */
export type ReviewSplitEntry = ReviewComputation & { assignee: string; lateDates?: string[] };

export function splitReviewByOwner(
  project: WorkProject,
  input: { assignee: string; dueDate: string; submittedDate?: string; hadRevision: boolean },
  rates: ProjectScoreRates = PROJECT_SCORE
): ReviewSplitEntry[] {
  const comp = computeReviewPoints({ verdict: "approve", ...input }, rates);
  if (comp.outcome !== "late") return [{ ...comp, assignee: input.assignee }];
  const submitted = input.submittedDate || input.dueDate;
  const shares = lateDaysByOwner(project, input.dueDate, submitted);
  if (shares.length <= 1) return [{ ...comp, assignee: shares[0]?.assignee || input.assignee }];
  return shares.map((share) => ({
    assignee: share.assignee,
    outcome: "late" as const,
    daysLate: share.days.length,
    points: -Math.abs(rates.latePerDay) * share.days.length,
    lateDates: share.days
  }));
}

// ---- อ่าน ledger รายคน --------------------------------------------------------

/** ผลตรวจของคนนี้ เรียงเก่า→ใหม่ตามเวลาที่กดยืนยัน */
export function reviewEntriesFor(project: Pick<WorkProject, "reviews">, assignee: string): ProjectReviewEntry[] {
  return (project.reviews || [])
    .filter((entry) => entry.assignee === assignee)
    .sort((a, b) => a.confirmedAt.localeCompare(b.confirmedAt));
}

/** คะแนนสุทธิของคนนี้ในงานนี้ (บวกลบทุกรายการใน ledger) */
export function netReviewPoints(entries: ProjectReviewEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.points, 0);
}

/** มีคำสั่งให้แก้ที่ยังไม่ปิดอยู่ไหม (รายการล่าสุดเป็น needs_fix) */
export function hasOpenRevision(entries: ProjectReviewEntry[]): boolean {
  const last = entries[entries.length - 1];
  return Boolean(last && last.outcome === "needs_fix");
}

/** กำหนดส่งที่มีผลกับคนนี้ตอนนี้ — ถ้าถูกสั่งแก้ ใช้กำหนดใหม่ ไม่งั้นใช้วันสิ้นสุดงาน */
export function effectiveDue(project: Pick<WorkProject, "reviews" | "endDate">, assignee: string): string {
  const last = reviewEntriesFor(project, assignee).slice(-1)[0];
  if (last && last.outcome === "needs_fix" && last.revisedDue) return last.revisedDue;
  return project.endDate;
}

// ---- สถานะที่แสดงบนจอ ---------------------------------------------------------

export type ProjectAssigneeStatus =
  | "pending" // รอตรวจ
  | "passed_early" // ผ่านก่อนกำหนด
  | "passed_ontime" // ผ่านตรงเวลา
  | "needs_fix" // ต้องแก้ไข (สั่งแก้แล้ว ยังไม่ส่งใหม่)
  | "awaiting_fix" // รอแก้ไข (ส่งใหม่แล้ว รอตรวจซ้ำ)
  | "late" // ล่าช้า
  | "confirmed"; // ยืนยันผ่านแล้ว (ผ่านหลังแก้)

export const ASSIGNEE_STATUS_LABEL: Record<ProjectAssigneeStatus, string> = {
  pending: "รอตรวจ",
  passed_early: "ผ่านก่อนกำหนด",
  passed_ontime: "ผ่านตรงเวลา",
  needs_fix: "ต้องแก้ไข",
  awaiting_fix: "รอแก้ไข",
  late: "ล่าช้า",
  confirmed: "ยืนยันผ่านแล้ว"
};

/** สีป้าย — class เดียวกับ workflow status ทั้งเว็บ */
export const ASSIGNEE_STATUS_CLASS: Record<ProjectAssigneeStatus, string> = {
  pending: "workflow-status-white",
  passed_early: "workflow-status-green",
  passed_ontime: "workflow-status-green",
  needs_fix: "workflow-status-red",
  awaiting_fix: "workflow-status-orange",
  late: "workflow-status-red",
  confirmed: "workflow-status-green"
};

export const OUTCOME_LABEL: Record<ProjectReviewOutcome, string> = {
  early_pass: "ผ่านก่อนกำหนด",
  ontime_pass: "ผ่านตรงเวลา",
  needs_fix: "ต้องแก้ไข",
  fixed_pass: "แก้แล้วผ่าน",
  late: "ล่าช้า"
};

/** มี progress ที่ลงหลังเวลาที่สั่งแก้ไหม (คนนี้ส่งใหม่แล้ว หรือ — งานกลุ่ม — ใครในทีมส่งก็นับ) */
function resubmittedAfter(project: WorkProject, assignee: string, since: string): boolean {
  const isGroup = projectMode(project) === "group";
  return (project.progress || []).some((entry) => entry.at > since && (isGroup || entry.by === assignee));
}

/** สถานะที่ควรแสดงต่อคนนี้ — อิงผลตรวจล่าสุด + ว่าส่งงานใหม่หรือยัง */
export function assigneeStatus(project: WorkProject, assignee: string): ProjectAssigneeStatus {
  const last = reviewEntriesFor(project, assignee).slice(-1)[0];
  if (!last) return "pending";
  switch (last.outcome) {
    case "needs_fix":
      return resubmittedAfter(project, assignee, last.confirmedAt) ? "awaiting_fix" : "needs_fix";
    case "late":
      return "late";
    case "early_pass":
      return "passed_early";
    case "ontime_pass":
      return "passed_ontime";
    case "fixed_pass":
      return "confirmed";
    default:
      return "pending";
  }
}

// ---- แปลง ledger → คะแนน KPI --------------------------------------------------

/**
 * แปลงผลตรวจงานทุกโปรเจกต์เป็น "score adjustment" ที่ KPI engine กินอยู่แล้ว
 * (หมวด assigned_work, มี workDate + reason). ทำให้พนักงานโดนหัก/ได้คืนคะแนนจริงในหน้า
 * คะแนนพนักงาน โดยไม่ต้องแก้ engine. รายการ 0 คะแนน (ผ่านตรงเวลา) ข้ามไป ไม่รก breakdown.
 * workDate = กำหนดส่งที่ยึดตอนตรวจ → คะแนนตกอยู่ในงวดจ่ายเงินที่ถูกต้อง.
 */
export function projectReviewsToAdjustments(projects: WorkProject[]): ScoreAdjustment[] {
  const out: ScoreAdjustment[] = [];
  for (const project of projects) {
    for (const entry of project.reviews || []) {
      if (!entry.points) continue;
      const lateText = entry.daysLate > 0 ? ` ${entry.daysLate} วัน` : "";
      out.push({
        id: `pr-adjust-${project.id}-${entry.id}`.replace(/[^a-zA-Z0-9-]/g, "-"),
        workDate: entry.dueDate,
        // ในสาขาบางแค code === ชื่อที่ KPI ใช้ (employeeCodes) — ตรงกันอยู่แล้ว
        employeeName: entry.assignee,
        category: "assigned_work",
        points: entry.points,
        reason: `งานที่มอบหมาย: ${project.title} — ${OUTCOME_LABEL[entry.outcome]}${lateText}`,
        recordedAt: entry.confirmedAt,
        recordedBy: entry.confirmedBy
      });
    }
  }
  return out;
}

/** สรุปผลตรวจรายคนสำหรับ UI (สถานะ + คะแนนสุทธิ + ผลตรวจล่าสุด + กำหนดที่มีผล) */
export type AssigneeReviewSummary = {
  assignee: string;
  displayName: string;
  status: ProjectAssigneeStatus;
  netPoints: number;
  due: string;
  openRevision: boolean;
  entries: ProjectReviewEntry[];
};

export function assigneeReviewSummary(project: WorkProject, assignee: string): AssigneeReviewSummary {
  const entries = reviewEntriesFor(project, assignee);
  return {
    assignee,
    displayName: displayNameFor(assignee),
    status: assigneeStatus(project, assignee),
    netPoints: netReviewPoints(entries),
    due: effectiveDue(project, assignee),
    openRevision: hasOpenRevision(entries),
    entries
  };
}
