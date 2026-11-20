import type { AssignedWork } from "./performance-score.ts";
import { ASSIGNED_WORK_STATUSES, type AssignedWorkStatus } from "./assigned-work-status-labels.ts";

type AssignedWorkStatusRecord = {
  workDate: string;
  status: string;
  submittedAt?: string;
};

export function isAssignedWorkPastDeadline(workDate: string, now = new Date()) {
  const deadlineBangkok = new Date(`${workDate}T16:59:59.999Z`);
  return now.getTime() > deadlineBangkok.getTime();
}

function assignedWorkDeadlineMs(workDate: string) {
  return new Date(`${workDate}T16:59:59.999Z`).getTime();
}

/**
 * Maps any legacy/old status value (from the pre-refactor 5-value enum, or anything
 * unexpected in a stored record) onto the new 3-value set so old records never break:
 *  - "done-ish" old values (early_quality / on_time / late_one_day — all were owner-approved
 *    outcomes) -> completed
 *  - "needs fixing" old value (needs_revision) -> needs_revision
 *  - "not_finished" written WITH a real submission (an admin manually flagged it) -> treated
 *    as needs_revision, since the work was touched but not accepted
 *  - "not_finished" with no submission timestamp is handled upstream as the non-enum
 *    "not submitted" display case, not forced into this enum
 *  - anything unrecognized -> pending_review (the safe/neutral default)
 */
export function normalizeAssignedWorkStatus(raw: string | undefined): AssignedWorkStatus {
  if ((ASSIGNED_WORK_STATUSES as readonly string[]).includes(raw || "")) return raw as AssignedWorkStatus;
  if (raw === "early_quality" || raw === "on_time" || raw === "late_one_day") return "completed";
  if (raw === "not_finished") return "needs_revision";
  return "pending_review";
}

/**
 * Display status for UI (identical for employees and admins): before any submission
 * exists, callers should show the plain "ยังไม่ส่งงาน" indicator instead of this value —
 * that case is intentionally kept OUT of the AssignedWorkStatus enum (see
 * lib/assigned-work-status-labels.ts). Once a submission exists, this normalizes whatever
 * is stored (including legacy values) into the 3-value set.
 */
export function effectiveAssignedWorkDisplayStatus(
  record: AssignedWorkStatusRecord
): AssignedWorkStatus | "not_submitted" {
  if (!record.submittedAt) return "not_submitted";
  return normalizeAssignedWorkStatus(record.status);
}

// KPI 3 Aug 2026 (ticket 6D3HIfy7) kept the deadline-based auto-fail only for SCORING: an
// unsubmitted record past the submission deadline is an automatic "not_finished" for the
// cumulative-deduction math in lib/performance-score.ts, regardless of the formal 3-value
// workflow status. It is never shown as a 4th formal status — see
// effectiveAssignedWorkDisplayStatus above for the UI-facing "ยังไม่ส่งงาน" case.
//
// When a submission exists, lateness is re-derived from submittedAt vs the same deadline
// (not from the status enum) so the exact historical deduction amounts still apply:
//  - still pending / sent back for revision -> no deduction yet (nothing finalized)
//  - completed on time -> 0
//  - completed after the deadline -> capped at the one-day-late deduction (there is no
//    worse "late but still accepted" bucket; truly unsubmitted work is not_finished)
export function assignedWorkScoringStatus(record: AssignedWorkStatusRecord, now = new Date()): AssignedWork["status"] {
  if (!record.submittedAt && isAssignedWorkPastDeadline(record.workDate, now)) return "not_finished";

  const normalized = normalizeAssignedWorkStatus(record.status);
  if (normalized === "needs_revision") return "needs_revision";
  if (normalized === "pending_review") return "on_time";

  // completed
  if (!record.submittedAt) return "on_time";
  const submittedMs = new Date(record.submittedAt).getTime();
  return submittedMs <= assignedWorkDeadlineMs(record.workDate) ? "on_time" : "late_one_day";
}
