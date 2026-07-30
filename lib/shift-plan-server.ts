import "server-only";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import { isWorkingAssignment, type ShiftAssignment } from "./shift-schedule.ts";

// Server-side reader for the shift PLAN (schedule_shifts). The planner UI writes these
// docs via the client SDK (lib/shift-schedule-store.ts); the owner dashboard needs the
// same data server-side to answer "who is actually rostered to work today?" without
// pulling a whole month or trusting the client.
//
// Doc shape mirrors PlanDoc: { branch, month, workDate, staffCode, assignment, ... }.

const SHIFTS = "schedule_shifts";

/**
 * Staff codes rostered to WORK on `workDate` (assignment s1/s2). Excludes off days,
 * personal/sick leave, and anyone with no plan cell at all.
 *
 * Returns `null` when there is NO plan for the branch-day (planner not filled yet). A
 * null result means "no schedule to filter by" — callers should fall back to their
 * previous behaviour rather than silently treating everyone as off-duty.
 */
export async function fetchWorkingStaffCodesForDate(
  branch: string,
  workDate: string
): Promise<Set<string> | null> {
  if (!hasAdminCredentials()) return null;

  const snapshot = await adminDb()
    .collection(SHIFTS)
    .where("branch", "==", branch)
    .where("workDate", "==", workDate)
    .get();

  // No plan cells at all for this day → no schedule to filter against.
  if (snapshot.empty) return null;

  const working = new Set<string>();
  for (const doc of snapshot.docs) {
    const data = doc.data() as { staffCode?: string; assignment?: ShiftAssignment };
    if (data.staffCode && data.assignment && isWorkingAssignment(data.assignment)) {
      working.add(data.staffCode);
    }
  }
  return working;
}
