// Pure view helpers for owner→staff assignments: status labels, status colour class,
// and the grouping the staff "งานของฉัน" list uses (วันนี้ / เกินกำหนด / ส่งแล้ว / ต้องแก้ไข).
// Kept free of the firebase SDK so it stays unit-testable and usable server-side.

import type { AssignmentStatus, WorkAssignment } from "./work-assignments-store.ts";

export const assignmentStatusLabel: Record<AssignmentStatus, string> = {
  open: "ยังไม่ส่ง",
  submitted: "ส่งแล้ว รอตรวจ",
  needs_revision: "ต้องแก้ไข",
  done: "รับงานแล้ว"
};

// Maps onto the existing workflow status colour utility classes used across the dashboard.
export const assignmentStatusClass: Record<AssignmentStatus, string> = {
  open: "workflow-status-white",
  submitted: "workflow-status-orange",
  needs_revision: "workflow-status-red",
  done: "workflow-status-green"
};

/** Only open / needs_revision work is still actionable by the staff member. */
export function isAssignmentActionable(status: AssignmentStatus): boolean {
  return status === "open" || status === "needs_revision";
}

export type AssignmentGroupKey = "revision" | "overdue" | "today" | "submitted";

export type AssignmentGroups = {
  revision: WorkAssignment[]; // ต้องแก้ไข — highest priority
  overdue: WorkAssignment[]; // เกินกำหนด — open & workDate ก่อนวันนี้
  today: WorkAssignment[]; // วันนี้ (และงานล่วงหน้า) — open & ยังไม่เกินกำหนด
  submitted: WorkAssignment[]; // ส่งแล้ว (รอตรวจ + รับงานแล้ว)
};

/**
 * Classify each assignment into exactly one bucket. Priority: a bounced-back task
 * ("ต้องแก้ไข") always shows in the revision group regardless of its date; then the
 * open tasks split into overdue vs today/upcoming; submitted+done both land in "ส่งแล้ว".
 */
export function groupAssignments(items: WorkAssignment[], today: string): AssignmentGroups {
  const groups: AssignmentGroups = { revision: [], overdue: [], today: [], submitted: [] };
  for (const item of items) {
    if (item.status === "needs_revision") {
      groups.revision.push(item);
    } else if (item.status === "submitted" || item.status === "done") {
      groups.submitted.push(item);
    } else if (item.workDate < today) {
      groups.overdue.push(item);
    } else {
      groups.today.push(item);
    }
  }
  const byDate = (a: WorkAssignment, b: WorkAssignment) => (a.workDate < b.workDate ? -1 : a.workDate > b.workDate ? 1 : 0);
  groups.revision.sort(byDate);
  groups.overdue.sort(byDate);
  groups.today.sort(byDate);
  groups.submitted.sort(byDate);
  return groups;
}
