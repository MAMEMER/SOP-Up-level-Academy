import { NextResponse } from "next/server";
import { requireUser } from "../../../../lib/auth.ts";
import { isPreviewMode } from "../../../../lib/preview-data.ts";
import { createClient } from "../../../../lib/supabase/server.ts";

export async function POST(request: Request) {
  const user = await requireUser();
  const { assignmentId, completedChecklist, totalChecklist, dueSeconds, items } = await request.json();

  if (!assignmentId || typeof assignmentId !== "string") {
    return NextResponse.json({ error: "assignmentId is required" }, { status: 400 });
  }

  const completedAt = new Date().toISOString();

  if (isPreviewMode()) {
    return NextResponse.json({
      run: {
        id: `preview-run-${assignmentId}`,
        assignment_id: assignmentId,
        user_id: user.id,
        status: "completed",
        started_at: new Date(Date.now() - 60_000).toISOString(),
        completed_at: completedAt,
        due_seconds: Number(dueSeconds) || 0,
        completed_checklist: Number(completedChecklist) || 0,
        total_checklist: Number(totalChecklist) || 0
      }
    });
  }

  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("task_assignments")
    .select("id,assigned_to")
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

  let savedRun;
  if (!existing) {
    const { data: run, error } = await supabase
      .from("task_runs")
      .insert({
        assignment_id: assignmentId,
        user_id: assignment.assigned_to,
        status: "completed",
        completed_at: completedAt,
        due_seconds: Number(dueSeconds) || 0,
        completed_checklist: Number(completedChecklist) || 0,
        total_checklist: Number(totalChecklist) || 0
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    savedRun = run;
  } else {
    const { data: run, error } = await supabase
      .from("task_runs")
      .update({
        status: "completed",
        completed_at: completedAt,
        due_seconds: Number(dueSeconds) || existing.due_seconds,
        completed_checklist: Number(completedChecklist) || 0,
        total_checklist: Number(totalChecklist) || 0
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    savedRun = run;
  }

  if (Array.isArray(items) && savedRun) {
    await supabase.from("task_run_items").delete().eq("run_id", savedRun.id);
    const rows = items.map((item: any) => ({
      run_id: savedRun.id,
      step_id: item.stepId || null,
      item_index: Number(item.itemIndex) || 0,
      label: String(item.label || ""),
      completed: Boolean(item.completed),
      completed_at: item.completed ? completedAt : null
    }));
    if (rows.length) await supabase.from("task_run_items").insert(rows);
  }

  return NextResponse.json({ run: savedRun });
}
