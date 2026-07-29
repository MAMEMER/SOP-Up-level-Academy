import { redirect } from "next/navigation";
import Link from "next/link";
import { StaffReviewView } from "../../../../components/StaffReviewView.tsx";
import { ViewAsSwitcher } from "../../../../components/ViewAsSwitcher.tsx";
import { requireUser } from "../../../../lib/auth.ts";
import { employeeDirectory } from "../../../../lib/employee-directory.ts";
import { formatWorkDate } from "../../../../lib/workflow-records.ts";

export default async function AdminStaffViewPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const staff = employeeDirectory
    .filter((entry) => entry.branch === "bangkae")
    .map((entry) => ({ code: entry.code, displayName: entry.displayName, employmentType: entry.employmentType, email: entry.email }));

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Staff review</p>
          <h2>มุมมองพนักงาน</h2>
          <p>เลือกพนักงาน + วัน เพื่อดูกะ · งานที่มอบหมาย · งานส่งต่อ · routine checklist ของเขา แบบรวดเดียว</p>
        </div>
      </section>
      <ViewAsSwitcher
        staff={staff
          .filter((entry): entry is typeof entry & { email: string } => Boolean(entry.email))
          .map((entry) => ({ email: entry.email, displayName: entry.displayName }))}
      />
      <StaffReviewView branch="bangkae" staff={staff} defaultDate={formatWorkDate()} />
    </main>
  );
}
