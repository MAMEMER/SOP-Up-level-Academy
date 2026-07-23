import { redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth.ts";
import { isPreviewMode } from "../../../../lib/preview-data.ts";
import { performanceStatus, qualifiesForPurpleStreak, type PerformanceColor } from "../../../../lib/task-performance.ts";
import { createClient } from "../../../../lib/supabase/server.ts";

type AssignmentRow = {
  id: string;
  assigned_to: string;
  work_date: string;
  sops: Array<{ title: string }> | { title: string } | null;
  assigned_profile: Array<{ name: string; email: string }> | { name: string; email: string } | null;
};

type RunRow = {
  assignment_id: string;
  started_at: string;
  completed_at: string | null;
  due_seconds: number;
  completed_checklist: number;
  total_checklist: number;
};

type LoginRow = {
  user_id: string;
  work_date: string;
  first_seen_at: string;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function colorLabel(color: PerformanceColor) {
  if (color === "green") return "ตรงเวลา ครบถ้วน";
  if (color === "orange") return "ครบแต่ช้า";
  if (color === "red") return "ยังไม่เริ่ม";
  if (color === "purple") return "สม่ำเสมอ 3+ วัน";
  return "รอดำเนินการ";
}

function streakByUser(assignments: AssignmentRow[], runs: Map<string, RunRow>) {
  const grouped = new Map<string, Map<string, boolean[]>>();
  assignments.forEach((assignment) => {
    const run = runs.get(assignment.id);
    const isGreen = Boolean(
      run?.completed_at &&
      performanceStatus({
        assigned: true,
        loggedIn: true,
        startedAt: run.started_at,
        completedAt: run.completed_at,
        dueSeconds: run.due_seconds,
        completedChecklist: run.completed_checklist,
        totalChecklist: run.total_checklist
      }) === "green"
    );
    if (!grouped.has(assignment.assigned_to)) grouped.set(assignment.assigned_to, new Map());
    const byDate = grouped.get(assignment.assigned_to)!;
    byDate.set(assignment.work_date, [...(byDate.get(assignment.work_date) || []), isGreen]);
  });

  const result = new Set<string>();
  grouped.forEach((byDate, userId) => {
    const recent = [...byDate.entries()]
      .sort(([left], [right]) => right.localeCompare(left))
      .slice(0, 4)
      .map(([, values]) => values.length > 0 && values.every(Boolean));
    if (qualifiesForPurpleStreak(recent)) result.add(userId);
  });
  return result;
}

export default async function AdminPerformancePage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const supabase = await createClient();
  const [{ data: assignments }, { data: runs }, { data: logins }] = await Promise.all([
    supabase
      .from("task_assignments")
      .select("id,assigned_to,work_date,sops(title),assigned_profile:profiles!task_assignments_assigned_to_fkey(name,email)")
      .order("work_date", { ascending: false }),
    supabase.from("task_runs").select("assignment_id,started_at,completed_at,due_seconds,completed_checklist,total_checklist"),
    supabase.from("employee_login_events").select("user_id,work_date,first_seen_at")
  ]);

  const assignmentRows = (assignments ? assignments : []) as AssignmentRow[];
  const runByAssignment = new Map(((runs ? runs : []) as RunRow[]).map((run) => [run.assignment_id, run]));
  const loginByUserDate = new Map(
    ((logins ? logins : []) as LoginRow[]).map((login) => [`${login.user_id}:${login.work_date}`, login])
  );
  const purpleUsers = streakByUser(assignmentRows, runByAssignment);

  const rows = assignmentRows.map((assignment) => {
    const run = runByAssignment.get(assignment.id);
    const login = loginByUserDate.get(`${assignment.assigned_to}:${assignment.work_date}`);
    const loggedIn = Boolean(login);
    const baseColor = performanceStatus({
      assigned: true,
      loggedIn,
      startedAt: run?.started_at || null,
      completedAt: run?.completed_at || null,
      dueSeconds: run?.due_seconds || 0,
      completedChecklist: run?.completed_checklist || 0,
      totalChecklist: run?.total_checklist || 0
    });
    const color = baseColor === "green" && purpleUsers.has(assignment.assigned_to) ? "purple" : baseColor;
    return { assignment, run, login, color };
  });

  return (
    <main className="page">
      <section className="board-hero">
        <div>
          <p className="eyebrow">Admin dashboard</p>
          <h2>ผลงานพนักงาน</h2>
          <p>ติดตามงานที่ assign รายวันจากเวลาเริ่มจริงจนจบ checklist</p>
        </div>
        <div className="board-stat">
          <span>Assignments</span>
          <strong>{rows.length}</strong>
        </div>
      </section>

      <div className="performance-list">
        {rows.map(({ assignment, run, login, color }) => {
          const sop = firstRelation(assignment.sops);
          const profile = firstRelation(assignment.assigned_profile);
          return (
            <article key={assignment.id} className={`performance-row performance-${color}`}>
              <div>
                <strong>{profile?.name || assignment.assigned_to}</strong>
                <span>{profile?.email || ""}</span>
              </div>
              <div>
                <strong>{sop?.title || "Assigned SOP"}</strong>
                <span>{assignment.work_date}</span>
              </div>
              <div>
                <strong>{colorLabel(color)}</strong>
                <span>
                  {login?.first_seen_at ? `Clock in ${new Date(login.first_seen_at).toLocaleTimeString("th-TH")}` : "ยังไม่ clock in"}
                </span>
                <span>{run?.completed_at ? `จบ ${new Date(run.completed_at).toLocaleTimeString("th-TH")}` : "ยังไม่มีเวลาจบ"}</span>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
