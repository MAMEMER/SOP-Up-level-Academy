"use client";

// Firestore store for owner→staff task assignments and staff↔staff handoffs.
// Both feed the staff "วันนี้ของฉัน" alert so a staff member sees, on login, what
// was assigned to them and what a teammate handed off across shifts.
//
//   work_assignments — owner assigns a task to a staff member for a date. Real-time
//                      replacement for the old local-JSON assignedWorkRecords.
//   work_handoffs    — a staff member parks a task for someone on another shift
//                      ("ลูกค้าฝากของ"), optionally targeted at a specific person.
//
// App-level gated by Supabase login (Firestore rules are open for this collection,
// matching the other internal-ops tools — see firestore.rules).

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { db } from "./firebase-client.ts";

const ASSIGNMENTS = "work_assignments";
const HANDOFFS = "work_handoffs";

export type WorkAssignment = {
  id: string;
  branch: string;
  workDate: string; // YYYY-MM-DD — the day it's due
  staffCode: string; // who it's for
  title: string;
  detail?: string;
  status: "open" | "done";
  assignedBy: string;
  createdAt: string;
  doneAt?: string;
};

export type WorkHandoff = {
  id: string;
  branch: string;
  workDate: string;
  title: string;
  detail?: string;
  fromStaff: string;
  /** target staff code, or "any" for whoever picks it up on the next shift */
  toStaff: string;
  status: "open" | "claimed" | "done";
  createdAt: string;
  claimedBy?: string;
  claimedAt?: string;
  doneAt?: string;
};

function newId(prefix: string, ...parts: string[]): string {
  // Deterministic-ish id without Math.random (unavailable in some sandboxes): the
  // caller passes enough parts (date + staff + title) to stay unique per intent.
  return `${prefix}__${parts.join("__").replace(/\s+/g, "-").slice(0, 120)}`;
}

// ── Assignments ─────────────────────────────────────────────────────────────

export async function assignWork(input: {
  branch: string;
  workDate: string;
  staffCode: string;
  title: string;
  detail?: string;
  assignedBy: string;
  createdAtIso: string;
}): Promise<void> {
  const id = newId("wa", input.workDate, input.staffCode, input.createdAtIso);
  const record: WorkAssignment = {
    id,
    branch: input.branch,
    workDate: input.workDate,
    staffCode: input.staffCode,
    title: input.title,
    ...(input.detail ? { detail: input.detail } : {}),
    status: "open",
    assignedBy: input.assignedBy,
    createdAt: input.createdAtIso
  };
  await setDoc(doc(db, ASSIGNMENTS, id), record);
}

/** Assignments for one staff member on one date (the login alert). */
export async function fetchMyAssignments(branch: string, workDate: string, staffCode: string): Promise<WorkAssignment[]> {
  const snap = await getDocs(
    query(
      collection(db, ASSIGNMENTS),
      where("branch", "==", branch),
      where("workDate", "==", workDate),
      where("staffCode", "==", staffCode)
    )
  );
  return snap.docs.map((d) => d.data() as WorkAssignment);
}

/** All assignments for a date (owner review). */
export async function fetchAssignmentsForDate(branch: string, workDate: string): Promise<WorkAssignment[]> {
  const snap = await getDocs(
    query(collection(db, ASSIGNMENTS), where("branch", "==", branch), where("workDate", "==", workDate))
  );
  return snap.docs.map((d) => d.data() as WorkAssignment);
}

export async function markAssignmentDone(id: string, doneAtIso: string): Promise<void> {
  await updateDoc(doc(db, ASSIGNMENTS, id), { status: "done", doneAt: doneAtIso });
}

export async function deleteAssignment(id: string): Promise<void> {
  await deleteDoc(doc(db, ASSIGNMENTS, id));
}

// ── Handoffs ────────────────────────────────────────────────────────────────

export async function createHandoff(input: {
  branch: string;
  workDate: string;
  title: string;
  detail?: string;
  fromStaff: string;
  toStaff: string; // code or "any"
  createdAtIso: string;
}): Promise<void> {
  const id = newId("ho", input.workDate, input.fromStaff, input.createdAtIso);
  const record: WorkHandoff = {
    id,
    branch: input.branch,
    workDate: input.workDate,
    title: input.title,
    ...(input.detail ? { detail: input.detail } : {}),
    fromStaff: input.fromStaff,
    toStaff: input.toStaff,
    status: "open",
    createdAt: input.createdAtIso
  };
  await setDoc(doc(db, HANDOFFS, id), record);
}

/** Open handoffs relevant to a staff member: targeted at them or open to anyone. */
export async function fetchOpenHandoffs(branch: string): Promise<WorkHandoff[]> {
  const snap = await getDocs(
    query(collection(db, HANDOFFS), where("branch", "==", branch), where("status", "in", ["open", "claimed"]))
  );
  return snap.docs.map((d) => d.data() as WorkHandoff);
}

export async function claimHandoff(id: string, staffCode: string, claimedAtIso: string): Promise<void> {
  await updateDoc(doc(db, HANDOFFS, id), { status: "claimed", claimedBy: staffCode, claimedAt: claimedAtIso });
}

export async function completeHandoff(id: string, doneAtIso: string): Promise<void> {
  await updateDoc(doc(db, HANDOFFS, id), { status: "done", doneAt: doneAtIso });
}

/** Handoffs a staff member should act on: addressed to them or unassigned ("any"). */
export function handoffsForStaff(handoffs: WorkHandoff[], staffCode: string): WorkHandoff[] {
  return handoffs.filter((h) => h.toStaff === staffCode || h.toStaff === "any" || h.claimedBy === staffCode);
}
