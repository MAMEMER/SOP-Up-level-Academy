// Single source of truth for the "แฟ้มงาน" (assigned work) formal status — the
// 3-value workflow state visible IDENTICALLY to employees and admins. Every component
// that renders an assigned-work status badge/label must import from here instead of
// keeping its own copy (ticket: simplify assigned-work status to 3 values).
//
// A 4th case — "ยังไม่ส่งงาน" (no submission yet) — is deliberately NOT part of this
// enum. It is a display-only case (see effectiveAssignedWorkDisplayStatus in
// assigned-work-status.ts) so it never leaks into scoring or the admin's status dropdown.

export const ASSIGNED_WORK_STATUSES = ["pending_review", "needs_revision", "completed"] as const;

export type AssignedWorkStatus = (typeof ASSIGNED_WORK_STATUSES)[number];

export const ASSIGNED_WORK_STATUS_LABEL: Record<AssignedWorkStatus, string> = {
  pending_review: "รอตรวจ",
  needs_revision: "แก้ไข",
  completed: "เสร็จสิ้น"
};

/** Site convention: green = done, orange = pending/in-flight, red = needs attention. */
export const ASSIGNED_WORK_STATUS_CLASS: Record<AssignedWorkStatus, string> = {
  pending_review: "workflow-status-orange",
  needs_revision: "workflow-status-red",
  completed: "workflow-status-green"
};

/** The "no submission yet" display case — NOT a formal status, just a label + class. */
export const ASSIGNED_WORK_NOT_SUBMITTED_LABEL = "ยังไม่ส่งงาน";
export const ASSIGNED_WORK_NOT_SUBMITTED_CLASS = "workflow-status-white";

export function isAssignedWorkStatus(value: unknown): value is AssignedWorkStatus {
  return typeof value === "string" && (ASSIGNED_WORK_STATUSES as readonly string[]).includes(value);
}
