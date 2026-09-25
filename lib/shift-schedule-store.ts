"use client";

// Client store for the shift planner. Fix 1: these four collections (schedule_shifts,
// schedule_events, schedule_actual, store_audit) used to be world read/write via the
// Firebase client SDK. They now go through the authenticated /api/schedule route (Admin
// SDK, session-verified) so the Firestore rules can be locked server-only. The exported
// types and function signatures are unchanged — callers did not have to change.

import type { ShiftAssignment } from "./shift-schedule.ts";
import type { BranchShiftConfig } from "./branch-shift-config.ts";

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
  activities?: DayActivity[];
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
  clockIn?: string;
  clockInSource?: "storehub" | "manual";
  leaveType?: "personal" | "sick";
  leaveNote?: string;
  absent?: boolean;
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

export type MonthPlan = {
  plans: PlanDoc[];
  events: EventDoc[];
  actuals: ActualDoc[];
};

async function getJson<T>(params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/schedule?${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`schedule read failed: ${res.status}`);
  return (await res.json()) as T;
}

async function post(body: Record<string, unknown>): Promise<void> {
  const res = await fetch("/api/schedule", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`schedule write failed: ${res.status}`);
}

/** Store open/close audit (from the Uplevel Academy store account), separate from staff. */
export async function fetchStoreAudit(branch: string, month: string): Promise<StoreAuditDoc[]> {
  const { rows } = await getJson<{ rows: StoreAuditDoc[] }>({ action: "storeAudit", branch, month });
  return rows;
}

/** Loads every plan / event / actual doc for a branch-month. ใช้ branch = "all" เพื่อดึงทุกสาขา. */
export async function loadMonthPlan(branch: string, month: string): Promise<MonthPlan> {
  return getJson<MonthPlan>({ action: "monthPlan", branch, month });
}

/** เวลาเข้างานของแต่ละกะ ทุกสาขา (ค่าเริ่มต้นจากโค้ดเมื่อยังไม่เคยตั้ง) */
export async function fetchBranchShiftConfigs(): Promise<BranchShiftConfig[]> {
  const { configs } = await getJson<{ configs: BranchShiftConfig[] }>({ action: "branchShifts", branch: "all" });
  return configs;
}

/** บันทึกเวลากะของสาขาหนึ่ง — คืนค่าที่ server ล้างแล้ว */
export async function saveBranchShiftConfig(config: BranchShiftConfig): Promise<BranchShiftConfig> {
  const res = await fetch("/api/schedule", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "saveBranchShifts", ...config })
  });
  if (!res.ok) throw new Error(`branch shifts write failed: ${res.status}`);
  const data = (await res.json()) as { config: BranchShiftConfig };
  return data.config;
}

/** ลบกะของสาขาอื่นในวัน-คนเดียวกัน (ใช้ตอนย้ายคนข้ามสาขา) */
export async function clearOtherBranchCells(input: {
  branch: string;
  workDate: string;
  staffCode: string;
}): Promise<void> {
  await post({ action: "clearOtherBranchCells", ...input });
}

/** Loads a single staff-day plan cell (for the staff "my shift today" view). */
export async function fetchShiftForStaffDate(
  branch: string,
  workDate: string,
  staffCode: string
): Promise<PlanDoc | null> {
  const { plan } = await getJson<{ plan: PlanDoc | null }>({ action: "shiftForStaffDate", branch, workDate, staffCode });
  return plan;
}

/** Loads the day annotation (title + activities) for one branch-day, or null when blank. */
export async function fetchDayEvent(branch: string, workDate: string): Promise<EventDoc | null> {
  const { event } = await getJson<{ event: EventDoc | null }>({ action: "dayEvent", branch, workDate });
  return event;
}

/** Loads every day annotation for the given months (an ISO week can straddle two). */
export async function fetchDayEventsForMonths(branch: string, months: string[]): Promise<EventDoc[]> {
  const unique = [...new Set(months)];
  if (!unique.length) return [];
  const { events } = await getJson<{ events: EventDoc[] }>({ action: "dayEventsForMonths", branch, months: unique.join(",") });
  return events;
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
  await post({ action: "savePlanCell", ...input });
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
  await post({ action: "saveDayEvent", ...input });
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
  await post({ action: "logLeave", ...input });
}

/**
 * Sets the ACTUAL day status the owner records for a staff-day — leave/absent is a real
 * event, not part of the plan. Merges so a StoreHub clock-in on the same doc is preserved;
 * "normal" clears any leave/absent override so the clock-in shows through again.
 */
export async function setActualStatus(input: {
  branch: string;
  workDate: string;
  staffCode: string;
  status: "normal" | "leave_personal" | "leave_sick" | "absent";
  updatedBy: string;
}): Promise<void> {
  await post({ action: "setActualStatus", ...input });
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
  await post({ action: "setSwap", ...input });
}
