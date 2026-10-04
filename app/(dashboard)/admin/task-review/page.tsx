import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Users } from "lucide-react";
import { requireUser } from "../../../../lib/auth.ts";
import { displayNameFor, employeeDirectory } from "../../../../lib/employee-directory.ts";
import { branchConfigs } from "../../../../lib/store-config.ts";
import { fetchAllWorkProjects } from "../../../../lib/work-projects-server-store.ts";
import { fetchStaffCodesForBranchMonth } from "../../../../lib/shift-plan-server.ts";
import { staffTaskCounts, taskState } from "../../../../lib/task-inbox.ts";
import { formatWorkDate } from "../../../../lib/workflow-records.ts";

export const dynamic = "force-dynamic";

// หน้าตรวจงานของเจ้าของ — แยกสาขา (คนละสี) · รายชื่อทีม + พนักงานในสาขา
// กดชื่อ → แฟ้มงานของคนนั้นแยกเดือน → กดงาน → ดูความคืบหน้า คอมเมนต์ ให้คะแนน
export default async function TaskReviewPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  const today = formatWorkDate();
  const projects = await fetchAllWorkProjects();
  // พนักงานในสาขา = สาขาหลักในรายชื่อ + คนที่มีกะสาขานี้เดือนนี้ (ข้ามสาขาได้ — ขึ้นทั้งสองที่)
  const scheduled = await Promise.all(branchConfigs.map((branch) => fetchStaffCodesForBranchMonth(branch.key, today.slice(0, 7)).catch(() => new Set<string>())));

  const waitingAll = projects.flatMap((project) =>
    project.assignees.filter((code) => taskState(project, code) === "submitted").map((code) => ({ project, code }))
  );

  return (
    <main className="page ti-page">
      <Link href="/admin" className="back-link">← กลับ หน้าหลักเจ้าของ</Link>
      <header className="ti-hero">
        <div>
          <h2>ตรวจงาน</h2>
          <p>เลือกสาขา → ทีมหรือพนักงาน → แฟ้มรายเดือน → กดงานเพื่อคอมเมนต์และให้คะแนน</p>
        </div>
        <Link href="/admin/projects" className="ti-btn ti-btn--soft">สั่งงานใหม่</Link>
      </header>

      {waitingAll.length ? (
        <section className="ti-queue">
          <h3 className="ti-section__title">
            รอตรวจ <span>{waitingAll.length}</span>
          </h3>
          {waitingAll.map(({ project, code }) => (
            <Link key={`${project.id}-${code}`} href={`/admin/task-review/${encodeURIComponent(code)}?month=${project.startDate.slice(0, 7)}`} className="ti-queue__item">
              <span className="ti-dot ti-dot--amber" aria-hidden />
              <span>
                <strong>{project.title}</strong>
                <small>{displayNameFor(code)}</small>
              </span>
              <ChevronRight size={18} aria-hidden />
            </Link>
          ))}
        </section>
      ) : null}

      <div className="ti-branches">
        {branchConfigs.map((branch, index) => {
          const staff = employeeDirectory.filter((entry) => entry.branch === branch.key || scheduled[index].has(entry.code));
          return (
            <section key={branch.key} className="ti-branch" style={{ ["--branch" as string]: branch.color }}>
              <h3 className="ti-branch__title">
                <span className="ti-branch__swatch" aria-hidden />
                สาขา{branch.shortName}
              </h3>
              <Link href={`/admin/task-review/team/${branch.key}`} className="ti-person ti-person--team">
                <Users size={18} aria-hidden />
                <span className="ti-person__name">ทีม{branch.shortName} (ทั้งทีม)</span>
                <ChevronRight size={18} aria-hidden />
              </Link>
              {staff.length === 0 ? <p className="ti-empty">ยังไม่มีพนักงานในสาขานี้</p> : null}
              {staff.map((person) => {
                const counts = staffTaskCounts(projects, person.code, today);
                return (
                  <Link key={person.code} href={`/admin/task-review/${encodeURIComponent(person.code)}`} className="ti-person">
                    <span className="ti-person__name">{person.displayName}</span>
                    <span className="ti-person__counts">
                      {counts.waiting ? <span className="ti-badge ti-badge--amber">รอตรวจ {counts.waiting}</span> : null}
                      {counts.needsFix ? <span className="ti-badge ti-badge--red">ต้องแก้ {counts.needsFix}</span> : null}
                      {counts.late ? <span className="ti-badge ti-badge--red">เลยกำหนด {counts.late}</span> : null}
                      {counts.active ? <span className="ti-badge ti-badge--neutral">กำลังทำ {counts.active}</span> : null}
                    </span>
                    <ChevronRight size={18} aria-hidden />
                  </Link>
                );
              })}
            </section>
          );
        })}
      </div>
    </main>
  );
}
