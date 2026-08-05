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
  status: "open" | "submitted" | "needs_revision" | "done";
  assignedBy?: string;
  note?: string;
  submittedAt?: string;
  // AssignWork stamps every doc of one multi-person batch with the SAME createdAt, so
  // createdAt + title identifies "งานเดียวกันมอบหลายคน" (same as /admin/ops grouping).
  createdAt?: string;
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
  createdAt?: string;
};

export type AssignedWorkFeedItem = {
  id: string;
  origin: "owner" | "handoff";
  title: string;
  detail?: string;
  workDate: string;
  assigneeLabel: string;
  originLabel: string;
  statusClass: "workflow-status-white" | "workflow-status-orange" | "workflow-status-green" | "workflow-status-red";
  statusText: string;
  href: string;
  // Shared across every assignee of one multi-person task — used to fold duplicate rows
  // into a single "งานทีม" card on the dashboard. Empty on legacy docs without a stamp.
  createdAt: string;
  // raw fields used only for viewer filtering
  staffCode: string | null;
  toStaff: string | null;
  fromStaff: string | null;
  claimedBy: string | null;
};

const OWNER_STATUS_META: Record<
  OwnerAssignmentInput["status"],
  { statusClass: AssignedWorkFeedItem["statusClass"]; statusText: string }
> = {
  open: { statusClass: "workflow-status-white", statusText: "ยังไม่ส่ง" },
  submitted: { statusClass: "workflow-status-orange", statusText: "ส่งแล้ว รอตรวจ" },
  needs_revision: { statusClass: "workflow-status-red", statusText: "ต้องแก้ไข" },
  done: { statusClass: "workflow-status-green", statusText: "รับงานแล้ว" }
};

export function ownerAssignmentToFeedItem(assignment: OwnerAssignmentInput): AssignedWorkFeedItem {
  const meta = OWNER_STATUS_META[assignment.status] ?? OWNER_STATUS_META.open;
  return {
    id: assignment.id,
    origin: "owner",
    title: assignment.title,
    detail: assignment.detail,
    workDate: assignment.workDate,
    assigneeLabel: displayNameFor(assignment.staffCode),
    originLabel: "มอบหมายโดยเจ้าของร้าน",
    statusClass: meta.statusClass,
    statusText: meta.statusText,
    // Click straight into the staff submit/detail page — staff ส่งงาน, เจ้าของร้านตรวจได้ที่นี่.
    href: `/assigned-work/task/${encodeURIComponent(assignment.id)}`,
    createdAt: assignment.createdAt ?? "",
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
    createdAt: handoff.createdAt ?? "",
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

// A single task on the dashboard, folded from the flat feed (one row PER assignee).
export type AssignedWorkFeedGroupMember = {
  id: string;
  label: string;
  statusText: string;
  statusClass: AssignedWorkFeedItem["statusClass"];
};

export type AssignedWorkFeedGroup = {
  key: string;
  title: string;
  detail?: string;
  workDate: string;
  origin: AssignedWorkFeedItem["origin"];
  originLabel: string;
  href: string;
  isTeam: boolean;
  members: AssignedWorkFeedGroupMember[];
};

/**
 * Fold the flat feed back into the task the owner handed out so a task given to several
 * people shows as ONE row with its member roster — mirroring the /admin/ops panel. Owner
 * rows sharing createdAt + title are the same task (AssignWork writes one doc per person
 * with a shared createdAt); each such row without a createdAt, and every handoff, stays
 * on its own. This is display-only — it does not touch how work is scored. First-seen
 * order is preserved so due-time ordering upstream is respected.
 */
export function groupAssignedWorkFeed(items: AssignedWorkFeedItem[]): AssignedWorkFeedGroup[] {
  const map = new Map<string, AssignedWorkFeedGroup>();
  const order: string[] = [];
  for (const item of items) {
    const key =
      item.origin === "owner" && item.createdAt
        ? `owner__${item.createdAt}__${item.title}`
        : `${item.origin}__${item.id}`;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        title: item.title,
        detail: item.detail,
        workDate: item.workDate,
        origin: item.origin,
        originLabel: item.originLabel,
        href: item.href,
        isTeam: false,
        members: []
      };
      map.set(key, group);
      order.push(key);
    }
    group.members.push({
      id: item.id,
      label: item.assigneeLabel,
      statusText: item.statusText,
      statusClass: item.statusClass
    });
  }
  const groups = order.map((key) => map.get(key)!);
  for (const group of groups) {
    group.isTeam = group.members.length > 1;
    group.members.sort((a, b) => a.label.localeCompare(b.label, "th"));
  }
  return groups;
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
