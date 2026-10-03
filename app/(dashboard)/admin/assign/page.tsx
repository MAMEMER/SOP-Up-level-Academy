import { redirect } from "next/navigation";
import Link from "next/link";
import { AssignWork } from "../../../../components/AssignWork.tsx";
import { requireUser } from "../../../../lib/auth.ts";
import { employeeDirectory } from "../../../../lib/employee-directory.ts";
import { buildTeamOptions } from "../../../../lib/team-options.ts";
import { resolveAdminBranch } from "../../../../lib/admin-branch.ts";
import { AdminBranchSwitch } from "../../../../components/AdminBranchSwitch.tsx";
import { formatWorkDate } from "../../../../lib/workflow-records.ts";

export default async function AdminAssignPage({ searchParams }: { searchParams?: Promise<{ branch?: string }> }) {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const branch = await resolveAdminBranch((searchParams ? await searchParams : {}).branch);

  const staff = employeeDirectory
    .map((entry) => ({ code: entry.code, displayName: entry.displayName, employmentType: entry.employmentType }));

  // Team quick-select shortcuts for the ผู้รับผิดชอบ picker (ticket AvYge3vV6w39OUfEHwIE).
  // Built from the full roster so onboarding a Sena-fest staff activates that team.
  const teams = buildTeamOptions(employeeDirectory);

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Assign work</p>
          <h2>มอบหมายงาน</h2>
          <p>สั่งงานให้ staff รายคน — งานจะขึ้นบนหน้า &quot;วันนี้ของฉัน&quot; ของเขาทันทีที่ login</p>
        </div>
      </section>
      <div className="admin-branch-bar">
        <AdminBranchSwitch value={branch} />
        <small>ข้อมูลในหน้านี้เป็นของสาขาที่เลือก</small>
      </div>
      <AssignWork key={branch} branch={branch} assignedBy={user.email ?? user.name} staff={staff} teams={teams} defaultDate={formatWorkDate()} />
    </main>
  );
}
