import "server-only";
import { adminDb } from "./firebase-admin.ts";
import { DEFAULT_LEAVE_POLICY, entitlement, remaining, usedLeave, type LeavePolicy, type Position } from "./leave-entitlement.ts";
import type { StaffRecord } from "./staff-records.ts";

export async function loadLeaveData(year: number, staff: StaffRecord[], date: string) {
  const db = adminDb();
  const [policyDoc, shifts, actuals] = await Promise.all([
    db.collection("sop_config").doc("leave_policy").get(),
    db.collection("schedule_shifts").where("workDate", ">=", `${year}-01-01`).where("workDate", "<=", `${year}-12-31`).get(),
    db.collection("schedule_actual").where("workDate", ">=", `${year}-01-01`).where("workDate", "<=", `${year}-12-31`).get()
  ]);
  const raw = policyDoc.data();
  const policy: LeavePolicy = { year: "calendar", vacationAfterMonths: typeof raw?.vacationAfterMonths === "number" ? raw.vacationAfterMonths : DEFAULT_LEAVE_POLICY.vacationAfterMonths, byPosition: structuredClone(DEFAULT_LEAVE_POLICY.byPosition) };
  for (const pos of Object.keys(policy.byPosition) as Position[]) for (const kind of ["sick", "personal", "vacation"] as const) {
    const value = raw?.byPosition?.[pos]?.[kind];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) policy.byPosition[pos][kind] = value;
  }
  const plans = shifts.docs.map(d => d.data()); const actual = actuals.docs.map(d => d.data());
  const rows = staff.map(person => {
    const used = person.code ? usedLeave(person.code, year, plans, actual) : { sick: 0, personal: 0, vacation: 0 };
    const allowed = entitlement(policy, person.position || "regular", person.startDate, date);
    return { person, used, allowed, remaining: remaining(allowed, used) };
  });
  return { policy, rows };
}
