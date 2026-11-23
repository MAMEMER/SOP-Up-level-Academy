import { eligibilityDate, validDate } from "./leave-entitlement.ts";

export type LeaveRequest = {
  id: string;
  staffCode: string;
  dates: string[];
  type: "vacation";
  note: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  createdAt: string;
  decidedBy?: string;
  decidedAt?: string;
  reason?: string;
};
export type LeaveRequestError = "past" | "too_soon" | "over_limit" | "not_entitled" | "duplicate";

/** Inputs are calendar dates in Asia/Bangkok, not UTC instants. */
export function earliestAllowedDate(today: string): string | null {
  return eligibilityDate(today, 1);
}

export function validateRequest(dates: string[], today: string, remainingIncludingPending: number): LeaveRequestError | null {
  if (!validDate(today) || dates.length === 0 || dates.some(date => !validDate(date) || date < today)) return "past";
  if (new Set(dates).size !== dates.length) return "duplicate";
  const earliest = earliestAllowedDate(today)!;
  if (dates.some(date => date < earliest)) return "too_soon";
  if (remainingIncludingPending <= 0) return "not_entitled";
  if (dates.length > remainingIncludingPending) return "over_limit";
  return null;
}
