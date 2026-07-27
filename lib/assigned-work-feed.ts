// Aggregates the assigned-work shown in the dashboard "งานที่มอบหมาย" section from the
// TWO real-time sources the store actually uses, on top of the KPI-linked
// sop_assigned_records already rendered there:
//
//   work_assignments — งานที่ "เจ้าของร้านมอบหมาย" ให้ staff รายคน (หน้า /admin/assign)
//   work_handoffs    — งานที่ "ส่งต่อจากกะปิดร้าน" ให้กะถัดไป (หน้า /handoff)
//
// Both are read server-side via the Firestore REST helper (same as the KPI records) so
// they render on the server-rendered dashboard. Pure mappers + viewer filtering live
// here (tested); only fetchAssignedWorkFeed touches the network.

import { displayNameFor } from "./employee-directory.ts";
import { restListCollection } from "./firestore-rest.ts";

const ASSIGNMENTS_COLLECTION = "work_assignments";
const HANDOFFS_COLLECTION = "work_handoffs";

// Structural shapes of the two Firestore collections (kept local so this server module
// never pulls in the firebase client SDK that work-assignments-store.ts imports).
export type OwnerAssignmentInput = {
  id: string;
  branch: string;
  workDate: string;
  staffCode: string;
  title: string;
  detail?: string;
  status: "open" | "done";
  assignedBy?: string;
};

export type HandoffInput = {
  id: string;
  branch: string;
  workDate: string;
  title: string;
  detail?: string;
  fromStaff: string;
  toStaff: string; // staff code or "any"
  status: "open" | "claimed" | "done";
  claimedBy?: string;
};

export type AssignedWorkFeedItem = {
  id: string;
  origin: "owner" | "handoff";
  title: string;
  detail?: string;
  workDate: string;
  assigneeLabel: string;
  originLabel: string;
  statusClass: "workflow-status-white" | "workflow-status-orange" | "workflow-status-green";
  statusText: string;
  href: string;
  // raw fields used only for viewer filtering
  staffCode: string | null;
  toStaff: string | null;
  fromStaff: string | null;
  claimedBy: string | null;
};

export function ownerAssignmentToFeedItem(assignment: OwnerAssignmentInput): AssignedWorkFeedItem {
  const done = assignment.status === "done";
  return {
    id: assignment.id,
    origin: "owner",
    title: assignment.title,
    detail: assignment.detail,
    workDate: assignment.workDate,
    assigneeLabel: displayNameFor(assignment.staffCode),
    originLabel: "มอบหมายโดยเจ้าของร้าน",
    statusClass: done ? "workflow-status-green" : "workflow-status-white",
    statusText: done ? "เสร็จแล้ว" : "รอทำ",
    href: "/admin/assign",
    staffCode: assignment.staffCode,
    toStaff: null,
    fromStaff: null,
    claimedBy: null
  };
}

export function handoffToFeedItem(handoff: HandoffInput): AssignedWorkFeedItem {
  const done = handoff.status === "done";
  const claimed = handoff.status === "claimed";
  const target = handoff.toStaff === "any" ? "ใครก็ได้กะถัดไป" : displayNameFor(handoff.toStaff);
  return {
    id: handoff.id,
    origin: "handoff",
    title: handoff.title,
    detail: handoff.detail,
    workDate: handoff.workDate,
    assigneeLabel: target,
    originLabel: `ส่งต่อจากกะปิดร้าน · จาก ${displayNameFor(handoff.fromStaff)}`,
    statusClass: done ? "workflow-status-green" : claimed ? "workflow-status-orange" : "workflow-status-white",
    statusText: done ? "เสร็จแล้ว" : claimed ? `รับแล้ว${handoff.claimedBy ? ` · ${displayNameFor(handoff.claimedBy)}` : ""}` : "รอรับงาน",
    href: "/handoff",
    staffCode: null,
    toStaff: handoff.toStaff,
    fromStaff: handoff.fromStaff,
    claimedBy: handoff.claimedBy ?? null
  };
}

/**
 * Filters the merged feed for who is looking:
 *  - owner (admin): sees everything
 *  - staff: sees owner-assignments addressed to their code, plus handoffs targeted at
 *    them / open to anyone / that they forwarded or claimed (same rule as MyShiftToday).
 */
export function assignedWorkFeedForViewer(
  items: AssignedWorkFeedItem[],
  viewer: { isAdmin: boolean; employeeCode: string | null }
): AssignedWorkFeedItem[] {
  if (viewer.isAdmin) return items;
  const code = viewer.employeeCode;
  if (!code) return [];
  return items.filter((item) => {
    if (item.origin === "owner") return item.staffCode === code;
    return item.toStaff === code || item.toStaff === "any" || item.claimedBy === code || item.fromStaff === code;
  });
}

/** Reads both collections for a branch+date and maps them to unified feed items. */
export async function fetchAssignedWorkFeed(branch: string, workDate: string): Promise<AssignedWorkFeedItem[]> {
  const [assignments, handoffs] = await Promise.all([
    restListCollection<OwnerAssignmentInput>(ASSIGNMENTS_COLLECTION),
    restListCollection<HandoffInput>(HANDOFFS_COLLECTION)
  ]);
  const ownerItems = assignments
    .filter((a) => a.branch === branch && a.workDate === workDate && Boolean(a.title))
    .map(ownerAssignmentToFeedItem);
  const handoffItems = handoffs
    .filter((h) => h.branch === branch && h.workDate === workDate && Boolean(h.title))
    .map(handoffToFeedItem);
  return [...ownerItems, ...handoffItems];
}
