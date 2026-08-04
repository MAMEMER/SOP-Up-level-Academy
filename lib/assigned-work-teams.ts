// Pure view helpers that fold the flat work_assignments list (one Firestore doc PER
// staff member) back into the task the owner actually handed out. When a task is given
// to several people at once, AssignWork writes one doc per person sharing the same
// `createdAt` + `title`, so we regroup on that key to show it as a single "งานทีม" with
// its member roster — instead of N duplicate rows. Kept free of the firebase SDK and
// "server-only" so it stays unit-testable and usable on either side of the wire.

import type { AssignmentStatus, WorkAssignment } from "./work-assignments-store.ts";
import { displayNameFor } from "./employee-directory.ts";

export type AssignmentMember = {
  assignmentId: string;
  staffCode: string;
  displayName: string;
  status: AssignmentStatus;
  /** filled once the assignee sends the work in — the assignee IS the submitter */
  submittedAt?: string;
  submittedBy?: string;
  note?: string;
  evidence?: string;
  imageEvidence?: string[];
};

export type AssignmentGroup = {
  key: string;
  title: string;
  type: "individual" | "team";
  detail?: string;
  location?: string;
  expectedResult?: string;
  dueTime?: string;
  trackingNumber?: string;
  attachments?: string[];
  assignedBy: string;
  createdAt: string;
  members: AssignmentMember[];
  memberCount: number;
};

function memberOf(item: WorkAssignment): AssignmentMember {
  return {
    assignmentId: item.id,
    staffCode: item.staffCode,
    displayName: displayNameFor(item.staffCode),
    status: item.status,
    submittedAt: item.submittedAt,
    // The person the task was assigned to is the one who submits it, so submittedBy is
    // their display name once a submission timestamp exists.
    submittedBy: item.submittedAt ? displayNameFor(item.staffCode) : undefined,
    note: item.note,
    evidence: item.evidence,
    imageEvidence: item.imageEvidence?.filter(Boolean)
  };
}

/**
 * Regroup assignments into the tasks that were handed out. Rows sharing the same
 * createdAt + title are one task assigned to multiple people (งานทีม); a lone row is an
 * individual task. Groups are ordered by due time (งานที่ครบกำหนดก่อนขึ้นก่อน), then title.
 */
export function groupAssignmentsByTask(items: WorkAssignment[]): AssignmentGroup[] {
  const map = new Map<string, AssignmentGroup>();
  for (const item of items) {
    const key = `${item.createdAt}__${item.title}`;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        title: item.title,
        type: "individual",
        detail: item.detail,
        location: item.location,
        expectedResult: item.expectedResult,
        dueTime: item.dueTime,
        trackingNumber: item.trackingNumber,
        attachments: item.attachments,
        assignedBy: item.assignedBy,
        createdAt: item.createdAt,
        members: [],
        memberCount: 0
      };
      map.set(key, group);
    }
    group.members.push(memberOf(item));
  }

  const groups = [...map.values()];
  for (const group of groups) {
    group.memberCount = group.members.length;
    group.type = group.members.length > 1 ? "team" : "individual";
    group.members.sort((left, right) => left.displayName.localeCompare(right.displayName, "th"));
  }
  groups.sort((left, right) => {
    const leftDue = left.dueTime || "99:99";
    const rightDue = right.dueTime || "99:99";
    if (leftDue !== rightDue) return leftDue < rightDue ? -1 : 1;
    return left.title.localeCompare(right.title, "th");
  });
  return groups;
}
