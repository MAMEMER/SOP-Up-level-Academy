import { redirect } from "next/navigation";
import Link from "next/link";
import { ShiftPlanner } from "../../../../components/ShiftPlanner.tsx";
import { StoreAuditPanel } from "../../../../components/StoreAuditPanel.tsx";
import { requireUser } from "../../../../lib/auth.ts";
import { isPreviewMode } from "../../../../lib/preview-data.ts";
import { employeeDirectory } from "../../../../lib/employee-directory.ts";

export default async function AdminSchedulePage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const staff = employeeDirectory.map((entry) => ({
    code: entry.code,
    displayName: entry.displayName,
    employmentType: entry.employmentType,
    branch: entry.branch
  }));

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Shift planning</p>
          <h2>ตารางกะการทำงาน</h2>
          <p>วางแผนกะรายเดือน · สลับกะให้สมดุล · ทุกวันอย่างน้อย 2 คน · เทียบแผนกับเวลาเข้างานจริง</p>
        </div>
      </section>
      <ShiftPlanner staff={staff} plannedBy={user.email ?? user.name} branch="bangkae" />
      <StoreAuditPanel branch="bangkae" />
    </main>
  );
}
