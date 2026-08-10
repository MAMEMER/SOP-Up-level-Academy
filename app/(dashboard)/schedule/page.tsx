import Link from "next/link";
import { MyScheduleView } from "../../../components/MyScheduleView.tsx";
import { requireUser } from "../../../lib/auth.ts";
import { branchFor, employeeDirectory, resolveEmployeeByEmail } from "../../../lib/employee-directory.ts";
import { formatWorkDate } from "../../../lib/workflow-records.ts";

// ตารางกะ (staff, read-only). The editable planner stays at /admin/schedule — this page
// only reads. Any signed-in staffer may see the whole branch roster: they need to know
// who is on with them, and the plan is posted in the shop anyway.

export default async function SchedulePage() {
  const user = await requireUser();
  const myStaffCode = resolveEmployeeByEmail(user.email) ?? null;
  const branch = myStaffCode ? branchFor(myStaffCode) : "bangkae";
  const today = formatWorkDate();

  const staff = employeeDirectory
    .filter((entry) => entry.branch === branch)
    .map((entry) => ({ code: entry.code, displayName: entry.displayName }));

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Schedule</p>
          <h2>ตารางกะ</h2>
          <p>ดูว่าวันไหนเข้ากี่โมง และวันนั้นใครเข้างานด้วย · แก้ไขได้เฉพาะคนที่มีสิทธิ์จัดการ</p>
        </div>
        {user.role === "admin" ? (
          <div className="hero-actions">
            <Link href="/admin/schedule" className="btn-soft">จัดกะ</Link>
          </div>
        ) : null}
      </section>
      <MyScheduleView
        staff={staff}
        branch={branch}
        myStaffCode={myStaffCode}
        today={today}
        initialMonth={today.slice(0, 7)}
      />
    </main>
  );
}
