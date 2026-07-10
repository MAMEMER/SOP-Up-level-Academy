import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PublicSopRunner } from "../../../../components/PublicSopRunner.tsx";
import { requireUser } from "../../../../lib/auth.ts";
import { createClient } from "../../../../lib/supabase/server.ts";

type StepRow = {
  id: string;
  step_order: number;
  title: string;
  body: string;
  checklist_items?: string[];
  duration_minutes?: number | null;
};

function lines(value: string) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export default async function AssignedTaskPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const user = await requireUser();
  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("task_assignments")
    .select("id,assigned_to,work_date,sops(*,departments(display_name),sop_steps(*)),profiles(name,email)")
    .eq("id", assignmentId)
    .single();

  if (!assignment) notFound();
  if (assignment.assigned_to !== user.id && user.role !== "admin") redirect("/");

  const sop = firstRelation<any>(assignment.sops);
  if (!sop) notFound();
  const steps = [...((sop.sop_steps || []) as StepRow[])].sort((left, right) => left.step_order - right.step_order);

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">{firstRelation<any>(sop.departments)?.display_name || "Assigned task"}</p>
          <h2>{sop.title}</h2>
          <p>{sop.purpose}</p>
          <p>วันที่งาน: {assignment.work_date}</p>
        </div>
      </section>
      <PublicSopRunner assignmentId={assignment.id} steps={steps} tools={lines(sop.required_tools || "")} />
    </main>
  );
}
