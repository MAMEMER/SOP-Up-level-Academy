// "ดูในมุมมองพนักงาน" — an owner/admin can render the whole site exactly as one of the
// staff accounts sees it, to verify that the right shift, tasks, checklist and score show
// up for that person.
//
// Deliberately READ-ONLY: while impersonating, every write path is blocked so an owner
// walking through a staff checklist can never tick items into that employee's real record
// (which feeds KPI and salary deduction). The banner in AppShell states this.

export const VIEW_AS_COOKIE = "sop_view_as";
export const VIEW_AS_EXPIRES_IN_MS = 8 * 60 * 60 * 1000; // 8 hours — a working session

/** Only admins may impersonate, and only accounts BELOW them (never another admin). */
export function canImpersonate(actorRole: string, targetRole: string): boolean {
  return actorRole === "admin" && targetRole !== "admin";
}
