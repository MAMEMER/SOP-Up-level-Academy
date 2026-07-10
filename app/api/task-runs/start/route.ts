import { NextResponse } from "next/server";
import { requireUser } from "../../../../lib/auth.ts";
import { isPreviewMode, previewLoginEvents, previewTaskAssignments } from "../../../../lib/preview-data.ts";
import { createClient } from "../../../../lib/supabase/server.ts";
import { taskStartFromClockIn } from "../../../../lib/task-clock.ts";

export async function POST(request: Request) {
  const user = await requireUser();
  const { assignmentId, dueSeconds, totalChecklist } = await request.json();

  if (!assignmentId || typeof assignmentId !== "string") {
    return NextResponse.json({ error: "assignmentId is required" }, { status: 400 });
  }

  if (isPreviewMode()) {
    const assignment = previewTaskAssignments.find((item) => item.id === assignmentId);
    const login = previewLoginEvents.find(
      (item) => item.user_id === user.id && item.work_date === assignment?.work_date
    );
    const now = new Date().toISOString();
    return NextResponse.json({
      run: {
        id: `preview-run-${assignmentId}`,
        assignment_id: assignmentId,
        user_id: user.id,
        status: "in_progress",
        started_at: taskStartFromClockIn(login?.first_seen_at, now),
        completed_at: null,
        due_seconds: Number(dueSeconds) || 0,
        completed_checklist: 0,
        total_checklist: Number(totalChecklist) || 0
      }
    });
  }

  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("task_assignments")
    .select("id,assigned_to,work_date")
    .eq("id", assignmentId)
    .single();

  if (!assignment || (assignment.assigned_to !== user.id && user.role !== "admin")) {
    return NextResponse.json({ error: "assignment not found" }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from("task_runs")
    .select("*")
    .eq("assignment_id", assignmentId)
    .single();

  if (existing) return NextResponse.json({ run: existing });

  const { data: login } = await supabase
    .from("employee_login_events")
    .select("first_seen_at")
    .eq("user_id", assignment.assigned_to)
    .eq("work_date", assignment.work_date)
    .single();

  const startedAt = taskStartFromClockIn(login?.first_seen_at, new Date().toISOString());

  const { data: run, error } = await supabase
    .from("task_runs")
    .insert({
      assignment_id: assignmentId,
      user_id: assignment.assigned_to,
      status: "in_progress",
      started_at: startedAt,
      due_seconds: Number(dueSeconds) || 0,
      completed_checklist: 0,
      total_checklist: Number(totalChecklist) || 0
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ run });
}
