// Pure decision layer for "which daily phases does this dashboard show, and is today an
// off day?" — kept free of React and Firestore so it can be unit-tested directly.
//
// The bug this fixes: use-shift-phases returned EVERY phase whenever a staffer had no
// working shift (off / leave / not rostered). The dashboard then coloured all of them
// from the workflow records, so a person on their day off saw the whole board flagged
// "เกินเวลา / เลยเวลา" — false late alerts for work that was never theirs. Admins must
// still see everything, so "no staffCode (admin)" is deliberately separated from
// "staffCode present but not working today".

import { phasesForShift, type WorkflowPhase } from "./card-store-workflow.ts";

/** How the staffer relates to today's roster, resolved from their plan cell.
 *  - "neutral": admin (no staffCode), still loading, or a fetch error → show all, no off-day.
 *  - "s1"/"s2": working that shift → show only that shift's phases.
 *  - "off": explicitly rostered OFF today.
 *  - "unrostered": no plan cell at all today. */
export type RosterState = "neutral" | "s1" | "s2" | "off" | "unrostered";

export type ShiftPhaseView = {
  /** phases to render — filtered to the working shift, otherwise every phase */
  phases: WorkflowPhase[];
  /** true only for a real staffer who is NOT working today: their phases are shown for
   *  reference and must never be coloured late/overdue. Admin view is never an off day. */
  offDay: boolean;
  /** banner label for an off day, or null (neutral / working) */
  offLabel: string | null;
};

const OFF_LABELS: Record<"off" | "unrostered", string> = {
  off: "วันหยุด",
  unrostered: "ไม่มีกะวันนี้"
};

/**
 * Decide the phase list + off-day flag for a dashboard.
 *
 * - neutral (admin / loading / error) → every phase, never an off day.
 * - working (s1/s2) → only that shift's phases (a กะ2 staffer never sees เปิดร้าน).
 * - off / unrostered → every phase, but flagged offDay so the UI mutes them and never
 *   marks them late (a day off is not "เลยเวลา").
 */
export function resolveShiftPhaseView(configuredPhases: WorkflowPhase[], roster: RosterState): ShiftPhaseView {
  if (roster === "s1" || roster === "s2") {
    return { phases: phasesForShift(configuredPhases, roster), offDay: false, offLabel: null };
  }
  if (roster === "off" || roster === "unrostered") {
    return { phases: configuredPhases, offDay: true, offLabel: OFF_LABELS[roster] };
  }
  return { phases: configuredPhases, offDay: false, offLabel: null };
}

/** Maps a resolved plan cell's assignment to a roster state for a real staffer. */
export function rosterFromAssignment(assignment: string | null | undefined): RosterState {
  if (assignment === "s1" || assignment === "s2") return assignment;
  if (assignment === "off") return "off";
  return "unrostered";
}
