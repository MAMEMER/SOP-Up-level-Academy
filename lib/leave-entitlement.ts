/** Annual leave calculations use ISO calendar dates in Asia/Bangkok. */
export type LeaveKind = "sick" | "personal" | "vacation";
export type Position = "temporary" | "regular" | "branch_manager";
export type Allowances = Record<LeaveKind, number>;
export type LeavePolicy = { year: "calendar"; byPosition: Record<Position, Allowances>; vacationAfterMonths: number };
export const DEFAULT_LEAVE_POLICY: LeavePolicy = {
  year: "calendar",
  byPosition: {
    temporary: { sick: 30, personal: 3, vacation: 0 },
    regular: { sick: 30, personal: 3, vacation: 13 },
    branch_manager: { sick: 30, personal: 3, vacation: 13 }
  },
  vacationAfterMonths: 0
};
export const LEAVE_KINDS: LeaveKind[] = ["sick", "personal", "vacation"];
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function eligibilityDate(start: string, months: number): string | null {
  if (!validDate(start)) return null;
  const [year, month, day] = start.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return first.toISOString().slice(0, 10);
}
export function entitlement(policy: LeavePolicy, position: Position, startDate: string | undefined, date: string): Allowances {
  const allowed = policy.byPosition[position];
  return { ...allowed };
}
type Row = { staffCode?: string; workDate?: string; assignment?: string; leaveType?: string; updatedAt?: string };
/** Actual leave takes precedence over the plan, and each person/date counts once. */
export function usedLeave(staffCode: string, year: number, shifts: Row[], actuals: Row[]): Allowances {
  const valid = (r: Row) => r.staffCode === staffCode && !!r.workDate && validDate(r.workDate) && r.workDate.startsWith(`${year}-`);
  const days = new Map<string, LeaveKind>();
  const plans = new Map<string, Row>();
  for (const row of shifts.filter(valid)) {
    const key = row.workDate!; const current = plans.get(key);
    const working = (r: Row) => r.assignment === "s1" || r.assignment === "s2";
    if (!current || (working(row) && !working(current)) || (working(row) === working(current) && (row.updatedAt || "") > (current.updatedAt || ""))) plans.set(key, row);
  }
  for (const [date, row] of plans) {
    const kind = row.assignment?.replace(/^leave_/, "") as LeaveKind;
    if (row.assignment?.startsWith("leave_") && LEAVE_KINDS.includes(kind)) days.set(date, kind);
  }
  for (const row of actuals.filter(valid)) if (LEAVE_KINDS.includes(row.leaveType as LeaveKind)) days.set(row.workDate!, row.leaveType as LeaveKind);
  const result: Allowances = { sick: 0, personal: 0, vacation: 0 };
  for (const kind of days.values()) result[kind]++;
  return result;
}
export function remaining(allowed: Allowances, used: Allowances): Allowances {
  return { sick: allowed.sick - used.sick, personal: allowed.personal - used.personal, vacation: allowed.vacation - used.vacation };
}

/** Calendar-month notice, clamped to the final day of the next month. */
export function vacationRequestMinimumDate(today: string): string | null {
  return eligibilityDate(today, 1);
}

export function pendingVacationDays(year: number, requests: Array<{status: string; dates: string[]}>) {
  return new Set(requests.filter(r => r.status === "pending").flatMap(r => r.dates.filter(d => validDate(d) && d.startsWith(`${year}-`)))).size;
}
