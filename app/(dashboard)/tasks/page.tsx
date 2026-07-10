import Link from "next/link";
import { requireUser } from "../../../lib/auth.ts";
import { createClient } from "../../../lib/supabase/server.ts";

type AssignmentRow = {
  id: string;
  work_date: string;
  sops: Array<{ title: string; purpose: string }> | { title: string; purpose: string } | null;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export default async function TasksPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("task_assignments")
    .select("id,work_date,sops(title,purpose)")
    .eq("assigned_to", user.id)
    .order("work_date", { ascending: false });

  return (
    <main className="page">
      <section className="board-hero">
        <div>
          <p className="eyebrow">Assigned tasks</p>
          <h2>งานของฉัน</h2>
          <p>กดเริ่มงานเพื่อให้ระบบจับเวลาและบันทึกผลให้ admin</p>
        </div>
      </section>
      <div className="work-list">
        {((data ? data : []) as AssignmentRow[]).map((assignment) => {
          const sop = firstRelation(assignment.sops);
          return (
            <Link key={assignment.id} href={`/tasks/${assignment.id}`} className="work-row">
              <div>
                <strong>{sop?.title || "Assigned SOP"}</strong>
                <span>{assignment.work_date} · {sop?.purpose || ""}</span>
              </div>
              <span className="status status-published">เริ่มทำ</span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
