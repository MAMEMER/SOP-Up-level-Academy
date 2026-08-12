// Pure helpers + types for admin "ตรวจงาน" verdicts on submitted checklists.
//
// A verdict is the owner's decision on ONE submitted unit of work — a person's daily
// phase, a weekly/monthly checklist, or an assigned task. It lives in its own Firestore
// collection (`sop_review_verdicts`) written only through the authenticated admin route,
// so the reviewer identity always comes from the session, never the client. This mirrors
// the approve / needs_revision model already used for Stock Runs (lib/stock-runs.ts), but
// generalised so every checklist type shares one review surface on /manager-review.

export const REVIEW_VERDICTS_COLLECTION = "sop_review_verdicts";

/** Which submission family a verdict is about. */
export type ReviewScope = "daily" | "weekly" | "monthly" | "assigned";

export type ReviewStatus = "approved" | "needs_fix";

export type ReviewVerdict = {
  /** docId — stable per (scope, scopeKey, employeeKey, unitId). */
  key: string;
  /** `${scope}:${scopeKey}` — single-field equality query for "everything reviewed this window". */
  groupKey: string;
  scope: ReviewScope;
  scopeKey: string;
  employeeKey: string;
  employeeName: string;
  /** phaseId (daily) / task or record id (assigned) / "all" (weekly-monthly single doc). */
  unitId: string;
  unitLabel: string;
  status: ReviewStatus;
  /** Reviewer's message — required when asking for a fix, optional on approve. */
  note: string;
  reviewedBy: string;
  reviewedByName: string;
  reviewedAt: string;
};

export function isReviewScope(value: unknown): value is ReviewScope {
  return value === "daily" || value === "weekly" || value === "monthly" || value === "assigned";
}

export function isReviewStatus(value: unknown): value is ReviewStatus {
  return value === "approved" || value === "needs_fix";
}

export function reviewGroupKey(scope: ReviewScope, scopeKey: string): string {
  return `${scope}:${scopeKey}`;
}

/** Filesystem/Firestore-safe doc id. Same sanitising rule as stock_runs ids. */
export function reviewVerdictId(scope: ReviewScope, scopeKey: string, employeeKey: string, unitId: string): string {
  return `rv__${scope}__${scopeKey}__${employeeKey}__${unitId}`
    .replace(/[^a-zA-Z0-9_:\-.]/g, "-")
    .slice(0, 200);
}

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  approved: "อนุมัติแล้ว",
  needs_fix: "ให้แก้ไข"
};

/** Maps a verdict to the existing workflow status colour classes used across the app. */
export const REVIEW_STATUS_CLASS: Record<ReviewStatus, string> = {
  approved: "workflow-status-green",
  needs_fix: "workflow-status-red"
};
