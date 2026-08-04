import "server-only";
import { restListCollection } from "./firestore-rest.ts";
import type { WorkAssignment, WorkHandoff } from "./work-assignments-store.ts";

// Server-side reader for the owner→staff assignment store. lib/work-assignments-store.ts
// is a "use client" module (Firebase browser SDK), so a Server Component that imports its
// functions gets a client REFERENCE, not the function — calling it on the server throws and
// the ops board silently rendered zero assignments. Here we read the same open collections
// (work_assignments / work_handoffs — `if true` in firestore.rules) through the Firestore
// REST API used elsewhere on the server, with `cache: "no-store"` so the data is fresh on
// every request. Same source of truth as /admin/assign, just fetched server-side.

const ASSIGNMENTS = "work_assignments";
const HANDOFFS = "work_handoffs";

/** All assignments for one branch + date (owner ops review). Fresh read, no cache. */
export async function fetchAssignmentsForDateServer(branch: string, workDate: string): Promise<WorkAssignment[]> {
  const all = await restListCollection<WorkAssignment>(ASSIGNMENTS);
  return all.filter((item) => item && item.branch === branch && item.workDate === workDate);
}

/** Open / claimed handoffs for a branch. Fresh read, no cache. */
export async function fetchOpenHandoffsServer(branch: string): Promise<WorkHandoff[]> {
  const all = await restListCollection<WorkHandoff>(HANDOFFS);
  return all.filter((item) => item && item.branch === branch && (item.status === "open" || item.status === "claimed"));
}
