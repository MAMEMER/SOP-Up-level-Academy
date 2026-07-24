"use client";

// Firestore store for the shift planner. Three collections in the shared
// up-level-guild project (see firebase-client.ts):
//
//   schedule_shifts  — the PLAN: one doc per (branch, workDate, staff) with the
//                      assigned shift + chosen entry time. Written by owners only.
//   schedule_events  — per-day annotation (tournament / special activity).
//   schedule_actual  — what ACTUALLY happened: StoreHub clock-in (synced in) and
//                      leave taken via the web (written by the leave button). The
//                      planner overlays this under each plan cell so the owner can
//                      see plan vs reality in one grid.
//
// Doc ids are deterministic (`branch__date__staff`) so a repeated edit upserts the
// same row instead of piling up duplicates. Every doc carries a `month` (YYYY-MM)
// field so a whole month loads with one indexed query.

import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where
} from "firebase/firestore";
import { db } from "./firebase-client.ts";
import type { ShiftAssignment } from "./shift-schedule.ts";

const SHIFTS = "schedule_shifts";
const EVENTS = "schedule_events";
const ACTUAL = "schedule_actual";

function monthOf(workDate: string): string {
  return workDate.slice(0, 7);
}

function shiftDocId(branch: string, workDate: string, staffCode: string): string {
  return `${branch}__${workDate}__${staffCode}`;
}

function eventDocId(branch: string, workDate: string): string {
  return `${branch}__${workDate}`;
}

export type PlanDoc = {
  branch: string;
  month: string;
  workDate: string;
  staffCode: string;
  assignment: ShiftAssignment;
  startTime?: string;
  updatedAt: string;
  updatedBy: string;
};

export type DayActivity = { game: string; time: string; title?: string };

export type EventDoc = {
  branch: string;
  month: string;
  workDate: string;
  title: string;
  note?: string;
  /** multiple activities can share a day/time — the store has space for parallel events */
  activities?: DayActivity[];
  /** legacy single-activity fields (kept for backward-compat reads) */
  game?: string;
  time?: string;
  updatedAt: string;
  updatedBy: string;
};

export type ActualDoc = {
  branch: string;
  month: string;
  workDate: string;
  staffCode: string;
  /** first StoreHub clock-in of the day, HH:MM (synced) */
  clockIn?: string;
  clockInSource?: "storehub" | "manual";
  /** leave logged through the web SOP leave button */
  leaveType?: "personal" | "sick";
  leaveNote?: string;
  /** planned to work but no clock-in and no leave */
  absent?: boolean;
  /** shift swapped to another staff (they work + clock in instead); excused for KPI */
  swappedTo?: string;
  swapNote?: string;
  updatedAt: string;
  updatedBy: string;
};

export type StoreAuditDoc = {
  branch: string;
  month: string;
  workDate: string;
  openTime?: string;
  closeTime?: string;
};

/** Store open/close audit (from the Uplevel Academy store account), separate from staff. */
export async function fetchStoreAudit(branch: string, month: string): Promise<StoreAuditDoc[]> {
  const snap = await getDocs(query(collection(db, "store_audit"), where("branch", "==", branch), where("month", "==", month)));
  return snap.docs.map((d) => d.data() as StoreAuditDoc).sort((a, b) => a.workDate.localeCompare(b.workDate));
}

export type MonthPlan = {
  plans: PlanDoc[];
  events: EventDoc[];
  actuals: ActualDoc[];
};

/** Loads every plan / event / actual doc for a branch-month. */
export async function loadMonthPlan(branch: string, month: string): Promise<MonthPlan> {
  const byMonth = (name: string) =>
    getDocs(query(collection(db, name), where("branch", "==", branch), where("month", "==", month)));

  const [shiftSnap, eventSnap, actualSnap] = await Promise.all([byMonth(SHIFTS), byMonth(EVENTS), byMonth(ACTUAL)]);

  return {
    plans: shiftSnap.docs.map((d) => d.data() as PlanDoc),
    events: eventSnap.docs.map((d) => d.data() as EventDoc),
    actuals: actualSnap.docs.map((d) => d.data() as ActualDoc)
  };
}

/** Loads a single staff-day plan cell (for the staff "my shift today" view). */
export async function fetchShiftForStaffDate(
  branch: string,
  workDate: string,
  staffCode: string
): Promise<PlanDoc | null> {
  const snap = await getDoc(doc(db, SHIFTS, shiftDocId(branch, workDate, staffCode)));
  return snap.exists() ? (snap.data() as PlanDoc) : null;
}

/** Upserts one plan cell. Pass assignment "off" to blank a working day. */
export async function savePlanCell(input: {
  branch: string;
  workDate: string;
  staffCode: string;
  assignment: ShiftAssignment;
  startTime?: string;
  updatedBy: string;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  const record: PlanDoc = {
    branch: input.branch,
    month: monthOf(input.workDate),
    workDate: input.workDate,
    staffCode: input.staffCode,
    assignment: input.assignment,
    ...(input.startTime ? { startTime: input.startTime } : {}),
    updatedAt: nowIso,
    updatedBy: input.updatedBy
  };
  await setDoc(doc(db, SHIFTS, shiftDocId(input.branch, input.workDate, input.staffCode)), record);
}

/** Upserts the per-day activity annotation. */
export async function saveDayEvent(input: {
  branch: string;
  workDate: string;
  title: string;
  note?: string;
  activities?: DayActivity[];
  updatedBy: string;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  const record: EventDoc = {
    branch: input.branch,
    month: monthOf(input.workDate),
    workDate: input.workDate,
    title: input.title,
    ...(input.note ? { note: input.note } : {}),
    ...(input.activities && input.activities.length ? { activities: input.activities } : {}),
    updatedAt: nowIso,
    updatedBy: input.updatedBy
  };
  await setDoc(doc(db, EVENTS, eventDocId(input.branch, input.workDate)), record);
}

/** Logs leave through the web (feeds the ACTUAL row). Used by the leave button. */
export async function logLeave(input: {
  branch: string;
  workDate: string;
  staffCode: string;
  leaveType: "personal" | "sick";
  note?: string;
  updatedBy: string;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  const record: ActualDoc = {
    branch: input.branch,
    month: monthOf(input.workDate),
    workDate: input.workDate,
    staffCode: input.staffCode,
    leaveType: input.leaveType,
    ...(input.note ? { leaveNote: input.note } : {}),
    updatedAt: nowIso,
    updatedBy: input.updatedBy
  };
  await setDoc(doc(db, ACTUAL, shiftDocId(input.branch, input.workDate, input.staffCode)), record, { merge: true });
}

/**
 * Sets the ACTUAL day status the owner records for a staff-day — leave/absent is a real
 * event, not part of the plan, so it lives here (same cell as clock-in), not the plan
 * dropdown. Merges so a StoreHub clock-in on the same doc is preserved; "normal" clears
 * any leave/absent override so the clock-in shows through again.
 */
export async function setActualStatus(input: {
  branch: string;
  workDate: string;
  staffCode: string;
  status: "normal" | "leave_personal" | "leave_sick" | "absent";
  updatedBy: string;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  const record: Record<string, unknown> = {
    branch: input.branch,
    month: monthOf(input.workDate),
    workDate: input.workDate,
    staffCode: input.staffCode,
    updatedAt: nowIso,
    updatedBy: input.updatedBy,
    leaveType: input.status === "leave_personal" ? "personal" : input.status === "leave_sick" ? "sick" : deleteField(),
    absent: input.status === "absent" ? true : deleteField(),
    // any explicit status clears a prior swap
    swappedTo: deleteField(),
    swapNote: deleteField()
  };
  await setDoc(doc(db, ACTUAL, shiftDocId(input.branch, input.workDate, input.staffCode)), record, { merge: true });
}

/** Records a shift swap: this staff's shift is covered by `swappedTo` (who clocks in
 *  normally). Excused for the original in KPI. Clears any leave/absent on the day. */
export async function setSwap(input: {
  branch: string;
  workDate: string;
  staffCode: string;
  swappedTo: string;
  note?: string;
  updatedBy: string;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  const record: Record<string, unknown> = {
    branch: input.branch,
    month: monthOf(input.workDate),
    workDate: input.workDate,
    staffCode: input.staffCode,
    updatedAt: nowIso,
    updatedBy: input.updatedBy,
    swappedTo: input.swappedTo,
    swapNote: input.note || deleteField(),
    leaveType: deleteField(),
    absent: deleteField()
  };
  await setDoc(doc(db, ACTUAL, shiftDocId(input.branch, input.workDate, input.staffCode)), record, { merge: true });
}
