import { redirect } from "next/navigation";
import Link from "next/link";
import { AssignWork } from "../../../../components/AssignWork.tsx";
import { requireUser } from "../../../../lib/auth.ts";
import { isPreviewMode } from "../../../../lib/preview-data.ts";
import { employeeDirectory } from "../../../../lib/employee-directory.ts";
import { formatWorkDate } from "../../../../lib/workflow-records.ts";

export default async function AdminAssignPage() {
  const user = await requireUser();
  if (user.role !== "admin" && !isPreviewMode()) redirect("/");

  const staff = employeeDirectory
    .filter((entry) => entry.branch === "bangkae")
    .map((entry) => ({ code: entry.code, displayName: entry.displayName, employmentType: entry.employmentType }));

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
      <AssignWork branch="bangkae" assignedBy={user.email ?? user.name} staff={staff} defaultDate={formatWorkDate()} />
    </main>
  );
}
