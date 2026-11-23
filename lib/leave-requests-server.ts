import "server-only";
import { randomUUID } from "node:crypto";
import type { Query } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin.ts";
import { listStaff } from "./staff-store.ts";
import { loadLeaveData } from "./leave-entitlement-server.ts";
import { pendingVacationDays } from "./leave-entitlement.ts";
import { validateRequest, type LeaveRequest, type LeaveRequestError } from "./leave-requests.ts";

const COLLECTION = "sop_leave_requests";
const ACTUAL = "schedule_actual";
const col = () => adminDb().collection(COLLECTION);

export async function listLeaveRequests(filter: { staffCode?: string; status?: LeaveRequest["status"] } = {}): Promise<LeaveRequest[]> {
  let query: Query = col();
  if (filter.staffCode) query = query.where("staffCode", "==", filter.staffCode);
  const snapshot = await query.get();
  return snapshot.docs
    .map((doc) => doc.data() as LeaveRequest)
    .filter((r) => !filter.status || r.status === filter.status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function pendingLeaveRequestCount(): Promise<number> {
  return (await col().where("status", "==", "pending").get()).size;
}

/** Vacation days left for one person this calendar year, pending requests already reserved. */
export async function vacationBalance(staffCode: string, today: string) {
  const year = Number(today.slice(0, 4));
  const staff = await listStaff();
  const person = staff.find((p) => p.code === staffCode);
  if (!person) return null;
  const [{ rows }, requests] = await Promise.all([loadLeaveData(year, [person], today), listLeaveRequests({ staffCode })]);
  const row = rows[0];
  const pending = pendingVacationDays(year, requests);
  return { person, allowed: row.allowed.vacation, used: row.used.vacation, pending, remaining: row.remaining.vacation - pending, requests };
}

export async function createLeaveRequest(input: { staffCode: string; dates: string[]; note: string; today: string }): Promise<{ ok: true } | { ok: false; error: LeaveRequestError | "unknown_staff" }> {
  const dates = [...new Set(input.dates)].sort();
  const balance = await vacationBalance(input.staffCode, input.today);
  if (!balance) return { ok: false, error: "unknown_staff" };
  const taken = new Set(balance.requests.filter((r) => r.status === "pending" || r.status === "approved").flatMap((r) => r.dates));
  if (dates.some((d) => taken.has(d))) return { ok: false, error: "duplicate" };
  const error = validateRequest(dates, input.today, balance.remaining);
  if (error) return { ok: false, error };
  const id = `lr_${input.today}_${input.staffCode}_${randomUUID().slice(0, 8)}`;
  const record: LeaveRequest = { id, staffCode: input.staffCode, dates, type: "vacation", note: input.note.slice(0, 300), status: "pending", createdAt: new Date().toISOString() };
  await col().doc(id).create(record);
  return { ok: true };
}

export async function cancelLeaveRequest(id: string, staffCode: string): Promise<boolean> {
  const ref = col().doc(id);
  return adminDb().runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const data = doc.data() as LeaveRequest | undefined;
    if (!data || data.staffCode !== staffCode || data.status !== "pending") return false;
    tx.update(ref, { status: "cancelled", decidedAt: new Date().toISOString(), decidedBy: staffCode });
    return true;
  });
}

/** Approve writes each date into schedule_actual as vacation leave (same doc id as the schedule API). */
export async function decideLeaveRequest(id: string, decision: "approved" | "rejected", by: string, reason: string): Promise<boolean> {
  const ref = col().doc(id);
  const doc = await ref.get();
  const data = doc.data() as LeaveRequest | undefined;
  if (!data || data.status !== "pending") return false;
  if (decision === "rejected" && !reason.trim()) return false;
  const now = new Date().toISOString();
  const batch = adminDb().batch();
  if (decision === "approved") {
    const person = (await listStaff()).find((p) => p.code === data.staffCode);
    const branch = person?.branch || "bangkae";
    for (const workDate of data.dates) {
      batch.set(adminDb().collection(ACTUAL).doc(`${branch}__${workDate}__${data.staffCode}`), {
        branch, month: workDate.slice(0, 7), workDate, staffCode: data.staffCode, leaveType: "vacation",
        leaveNote: `อนุมัติคำขอวันหยุด ${id}`, updatedAt: now, updatedBy: by
      }, { merge: true });
    }
  }
  batch.update(ref, { status: decision, decidedBy: by, decidedAt: now, ...(reason.trim() ? { reason: reason.trim().slice(0, 300) } : {}) });
  await batch.commit();
  return true;
}
