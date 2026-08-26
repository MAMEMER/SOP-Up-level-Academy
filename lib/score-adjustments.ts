import type { DeductionRecord, ScoreCategoryKey } from "./performance-score.ts";

// Owner corrections to a computed KPI score.
//
// Everything else in the engine is derived — from the planner, from StoreHub, from the
// submitted checklists. When one of those inputs is wrong (a clock-in that never synced, a
// spot-check logged against the wrong person, a deadline that was not the staffer's fault)
// the owner needs to hand the points back without editing history. An adjustment does that:
// a signed number of points against one category, with a reason that is required, and that
// shows up in the breakdown next to the deductions it answers.
//
// Storage lives in lib/score-adjustment-store.ts. This half stays free of server-only
// imports so the maths can be unit-tested.

export const SCORE_ADJUSTMENT_COLLECTION = "sop_score_adjustments";

export const adjustmentCategoryOptions: Array<{ value: ScoreCategoryKey; label: string }> = [
  { value: "attendance", label: "เข้างาน" },
  { value: "stock", label: "Stock" },
  { value: "checklist", label: "Checklist" },
  { value: "customer_service", label: "บริการลูกค้า" },
  { value: "assigned_work", label: "งานที่มอบหมาย" }
];

export type ScoreAdjustment = {
  id: string;
  /** the day the adjustment belongs to — it counts in whatever period contains it */
  workDate: string;
  employeeName: string;
  category: ScoreCategoryKey;
  /** signed: + คืนคะแนน (หักผิด), − หักเพิ่ม */
  points: number;
  /** why — required, this is the record of the owner's decision */
  reason: string;
  recordedAt: string;
  recordedBy: string;
};

export type ScoreAdjustmentInput = Omit<ScoreAdjustment, "id" | "recordedAt">;

function adjustmentId(input: { workDate: string; employeeName: string; category: string }, recordedAt: string) {
  return `adjust-${input.workDate}-${input.employeeName}-${input.category}-${recordedAt}`.replace(/[^a-zA-Z0-9-]/g, "-");
}

/**
 * True only for owner-entered adjustments that live as their own Firestore doc and can be
 * deleted. Derived adjustments merged into the same list — project reviews (`pr-adjust-…`,
 * from /admin/projects) and auto no-progress penalties (`awnp-…`) — are NOT stored here, so
 * a delete of their id silently no-ops and the row re-appears on the next render (the
 * "ยกเลิกไม่ได้" bug). Those must be changed at their source, not cancelled here.
 */
export function isManualScoreAdjustment(id: string) {
  return id.startsWith("adjust-");
}

export function buildScoreAdjustment(input: ScoreAdjustmentInput, recordedAt = new Date().toISOString()): ScoreAdjustment {
  return {
    ...input,
    points: Math.round(input.points),
    reason: input.reason.trim(),
    recordedAt,
    id: adjustmentId(input, recordedAt)
  };
}

export function scoreAdjustmentsForDate(adjustments: ScoreAdjustment[], workDate: string) {
  return adjustments.filter((adjustment) => adjustment.workDate === workDate);
}

/**
 * Renders adjustments as breakdown lines. `points` on a DeductionRecord counts DOWN, so a
 * +2 credit is stored as -2 points here and reads as "คืน 2 คะแนน" in the UI.
 */
export function scoreAdjustmentsToRecords(adjustments: ScoreAdjustment[]): DeductionRecord[] {
  return adjustments.map((adjustment) => ({
    category: adjustment.category,
    points: -adjustment.points,
    reason: adjustment.points >= 0 ? "manual_credit" : "manual_deduction",
    detail: `${adjustment.points >= 0 ? "คืน" : "หักเพิ่ม"} ${Math.abs(adjustment.points)} คะแนน (${adjustment.workDate}) — ${adjustment.reason}`,
    source: "manual" as const
  }));
}

export function totalAdjustmentPoints(adjustments: ScoreAdjustment[]) {
  return adjustments.reduce((sum, adjustment) => sum + adjustment.points, 0);
}
