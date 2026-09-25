import Link from "next/link";
import { MyScheduleView } from "../../../components/MyScheduleView.tsx";
import { requireUser } from "../../../lib/auth.ts";
import { resolveEmployeeByEmail } from "../../../lib/employee-directory.ts";
import { listStaff } from "../../../lib/staff-store.ts";
import { branchConfigs } from "../../../lib/store-config.ts";
import { formatWorkDate } from "../../../lib/workflow-records.ts";

export const dynamic = "force-dynamic";

// ตารางกะ (staff, read-only). The editable planner stays at /admin/schedule — this page
// only reads. Any signed-in staffer may see the whole branch roster: they need to know
// who is on with them, and the plan is posted in the shop anyway.

export default async function SchedulePage() {
  const user = await requireUser();
  const myStaffCode = resolveEmployeeByEmail(user.email) ?? null;
  const today = formatWorkDate();

  // ทุกคนที่ลงกะได้ ไม่แยกตามสาขาบ้าน — คนสลับไปช่วยอีกสาขาได้ ตารางจึงต้องเห็นทั้งร้าน
  const records = await listStaff();
  const staff = records
    .filter((record) => record.active && record.onSchedule && record.code)
    .map((record) => ({ code: record.code, displayName: record.displayName || record.name }));
  const branches = branchConfigs.map((entry) => ({
    key: entry.key,
    shortName: entry.shortName,
    tag: entry.tag,
    color: entry.color
  }));

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
        branches={branches}
        myStaffCode={myStaffCode}
        today={today}
        initialMonth={today.slice(0, 7)}
      />
    </main>
  );
}
