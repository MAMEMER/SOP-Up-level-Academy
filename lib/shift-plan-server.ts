import "server-only";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import { isWorkingAssignment, type ShiftAssignment, type ShiftCode } from "./shift-schedule.ts";

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
  const shifts = await fetchShiftAssignmentsForDate(branch, workDate);
  return shifts ? new Set(shifts.keys()) : null;
}

/**
 * Per-staff WORKING shift (s1/s2) rostered on `workDate`, keyed by staff code. Off days,
 * leave, and staff with no plan cell are omitted. Returns `null` when there is NO plan for
 * the branch-day (planner not filled yet) so callers can tell "off-duty" apart from
 * "no schedule to compare against".
 *
 * The owner dashboard uses this to show each staffer's rostered shift next to what they
 * actually ticked — surfacing e.g. a closing-shift person who submitted the opening
 * (เปิดร้าน) checklist by mistake.
 */
export async function fetchShiftAssignmentsForDate(
  branch: string,
  workDate: string
): Promise<Map<string, ShiftCode> | null> {
  if (!hasAdminCredentials()) return null;

  const snapshot = await adminDb()
    .collection(SHIFTS)
    .where("branch", "==", branch)
    .where("workDate", "==", workDate)
    .get();

  // No plan cells at all for this day → no schedule to filter against.
  if (snapshot.empty) return null;

  const shifts = new Map<string, ShiftCode>();
  for (const doc of snapshot.docs) {
    const data = doc.data() as { staffCode?: string; assignment?: ShiftAssignment };
    if (data.staffCode && data.assignment && isWorkingAssignment(data.assignment)) {
      shifts.set(data.staffCode, data.assignment);
    }
  }
  return shifts;
}
