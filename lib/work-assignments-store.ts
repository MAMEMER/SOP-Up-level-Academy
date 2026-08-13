"use client";

// Client store for owner→staff task assignments and staff↔staff handoffs.
// Fix 1: work_assignments + work_handoffs used to be world read/write via the Firebase
// client SDK; they now go through the authenticated /api/work-tasks route (Admin SDK,
// session-verified, ownership-checked). Exported types and signatures are unchanged.

export type AssignmentStatus = "open" | "submitted" | "needs_revision" | "done";

/**
 * ความคืบหน้าระหว่างทางของงานที่มอบหมาย — งานที่ยังไม่เสร็จก็รายงานได้ ไม่ต้องรอส่งจบ.
 * ส่งกี่ครั้งก็ได้ แนบรูปได้ทุกครั้ง และไม่เปลี่ยนสถานะงาน (ยังไม่ถือว่าส่งงาน).
 */
export type AssignmentProgress = {
  id: string;
  /** เวลาที่กดส่ง (ISO) */
  at: string;
  /** staff code ของคนที่อัปเดต */
  by: string;
  note: string;
  images?: string[];
};

/** เก็บได้สูงสุดกี่อัปเดตต่องาน (กันเอกสารบวมชนลิมิต 1MiB ของ Firestore) */
export const MAX_ASSIGNMENT_PROGRESS = 50;

export type WorkAssignment = {
  id: string;
  branch: string;
  workDate: string;
  staffCode: string;
  title: string;
  detail?: string;
  location?: string;
  expectedResult?: string;
  dueTime?: string;
  attachments?: string[];
  trackingNumber?: string;
  status: AssignmentStatus;
  assignedBy: string;
  createdAt: string;
  note?: string;
  evidence?: string;
  imageEvidence?: string[];
  submittedAt?: string;
  revisionNote?: string;
  reviewedAt?: string;
  doneAt?: string;
  /** อัปเดตความคืบหน้าระหว่างทาง เรียงเก่า→ใหม่ */
  progress?: AssignmentProgress[];
};

export type WorkHandoff = {
  id: string;
  branch: string;
  workDate: string;
  title: string;
  detail?: string;
  fromStaff: string;
  toStaff: string;
  status: "open" | "claimed" | "done";
  createdAt: string;
  claimedBy?: string;
  claimedAt?: string;
  doneAt?: string;
};

async function getJson<T>(params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/work-tasks?${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`work-tasks read failed: ${res.status}`);
  return (await res.json()) as T;
}

async function post(body: Record<string, unknown>): Promise<void> {
  const res = await fetch("/api/work-tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const detail = await res
      .json()
      .then((d) => (d as { detail?: string }).detail)
      .catch(() => undefined);
    throw new Error(detail || `work-tasks write failed: ${res.status}`);
  }
}

// ── Assignments ─────────────────────────────────────────────────────────────

export async function assignWork(input: {
  branch: string;
  workDate: string;
  staffCode: string;
  title: string;
  detail?: string;
  location?: string;
  expectedResult?: string;
  dueTime?: string;
  attachments?: string[];
  trackingNumber?: string;
  assignedBy: string;
  createdAtIso: string;
}): Promise<void> {
  await post({ action: "assignWork", ...input });
}

export async function fetchMyAssignments(branch: string, workDate: string, staffCode: string): Promise<WorkAssignment[]> {
  const { assignments } = await getJson<{ assignments: WorkAssignment[] }>({ action: "myAssignments", branch, workDate, staffCode });
  return assignments;
}

export async function fetchAssignmentsForDate(branch: string, workDate: string): Promise<WorkAssignment[]> {
  const { assignments } = await getJson<{ assignments: WorkAssignment[] }>({ action: "assignmentsForDate", branch, workDate });
  return assignments;
}

export async function fetchAssignmentsForStaff(branch: string, staffCode: string): Promise<WorkAssignment[]> {
  const { assignments } = await getJson<{ assignments: WorkAssignment[] }>({ action: "assignmentsForStaff", branch, staffCode });
  return assignments;
}

export async function fetchAssignmentById(id: string): Promise<WorkAssignment | null> {
  const { assignment } = await getJson<{ assignment: WorkAssignment | null }>({ action: "assignmentById", id });
  return assignment;
}

export async function submitAssignment(
  id: string,
  input: { note: string; evidence?: string; imageEvidence?: string[]; submittedAtIso: string }
): Promise<void> {
  // Keep the same client-side guard for immediate UX; the server re-checks it too.
  const note = input.note.trim();
  const hasEvidence =
    (input.imageEvidence?.some((u) => u.trim().length > 0) ?? false) || Boolean(input.evidence?.trim());
  if (!note) throw new Error("ต้องกรอกรายละเอียดสิ่งที่ทำก่อนส่งงาน");
  if (!hasEvidence) throw new Error("ต้องแนบหลักฐานอย่างน้อย 1 อย่างก่อนส่งงาน");
  await post({ action: "submitAssignment", id, note, evidence: input.evidence ?? "", imageEvidence: input.imageEvidence ?? [] });
}

/** อัปเดตความคืบหน้าโดยไม่ปิดงาน — รูปแนบได้แต่ไม่บังคับ (งานยังทำอยู่) */
export async function addAssignmentProgress(id: string, input: { note: string; images?: string[] }): Promise<void> {
  const note = input.note.trim();
  if (!note) throw new Error("เขียนสั้นๆ ว่าตอนนี้ทำถึงไหนแล้ว");
  await post({ action: "addAssignmentProgress", id, note, images: input.images ?? [] });
}

export async function deleteAssignmentProgress(id: string, progressId: string): Promise<void> {
  await post({ action: "deleteAssignmentProgress", id, progressId });
}

/** อัปเดตล่าสุดของงานนี้ (ยังไม่มี = null) */
export function latestProgress(assignment: Pick<WorkAssignment, "progress">): AssignmentProgress | null {
  const list = assignment.progress || [];
  return list.length ? list[list.length - 1] : null;
}

export async function requestAssignmentRevision(id: string, note: string, reviewedAtIso: string): Promise<void> {
  void reviewedAtIso;
  await post({ action: "requestAssignmentRevision", id, note });
}

export async function acceptAssignment(id: string, reviewedAtIso: string): Promise<void> {
  void reviewedAtIso;
  await post({ action: "acceptAssignment", id });
}

export async function markAssignmentDone(id: string, doneAtIso: string): Promise<void> {
  void doneAtIso;
  await post({ action: "markAssignmentDone", id });
}

export async function deleteAssignment(id: string): Promise<void> {
  await post({ action: "deleteAssignment", id });
}

// ── Handoffs ────────────────────────────────────────────────────────────────

export async function createHandoff(input: {
  branch: string;
  workDate: string;
  title: string;
  detail?: string;
  fromStaff: string;
  toStaff: string;
  createdAtIso: string;
}): Promise<void> {
  await post({ action: "createHandoff", ...input });
}

export async function fetchOpenHandoffs(branch: string): Promise<WorkHandoff[]> {
  const { handoffs } = await getJson<{ handoffs: WorkHandoff[] }>({ action: "openHandoffs", branch });
  return handoffs;
}

export async function claimHandoff(id: string, staffCode: string, claimedAtIso: string): Promise<void> {
  void claimedAtIso;
  await post({ action: "claimHandoff", id, staffCode });
}

export async function completeHandoff(id: string, doneAtIso: string): Promise<void> {
  void doneAtIso;
  await post({ action: "completeHandoff", id });
}

/** Handoffs a staff member should act on: addressed to them or unassigned ("any"). */
export function handoffsForStaff(handoffs: WorkHandoff[], staffCode: string): WorkHandoff[] {
  return handoffs.filter((h) => h.toStaff === staffCode || h.toStaff === "any" || h.claimedBy === staffCode);
}
