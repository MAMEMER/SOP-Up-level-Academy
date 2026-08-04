import { NextResponse } from "next/server";
import { requireUser } from "../../../../../lib/auth.ts";
import { fetchAssignmentsForDateServer } from "../../../../../lib/work-assignments-server.ts";
import { groupAssignmentsByTask } from "../../../../../lib/assigned-work-teams.ts";
import { formatWorkDate } from "../../../../../lib/workflow-records.ts";

// Near-real-time feed for the owner ops board's "งานที่มอบหมาย" panel. The panel polls
// this every 60s so a task assigned from /admin/assign (or a submission from a staff
// member) shows up without a manual reload. Reads the same work_assignments source as
// /admin/assign, server-side + no-store, and folds it into task groups (team tasks merged).
//
//   GET /api/admin/ops/assignments?date=YYYY-MM-DD
export const dynamic = "force-dynamic";

function isDateValue(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export async function GET(request: Request) {
  const user = await requireUser();
  if (user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const dateParam = new URL(request.url).searchParams.get("date");
  const workDate = isDateValue(dateParam) ? dateParam : formatWorkDate();

  const assignments = await fetchAssignmentsForDateServer("bangkae", workDate);
  const groups = groupAssignmentsByTask(assignments);

  return NextResponse.json(
    { workDate, groups },
    { headers: { "Cache-Control": "no-store" } }
  );
}
