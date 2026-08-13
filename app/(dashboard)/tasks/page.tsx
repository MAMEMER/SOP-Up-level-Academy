import Link from "next/link";
import { TodayTaskList } from "../../../components/TodayTaskList.tsx";
import { requireUser } from "../../../lib/auth.ts";
import { branchFor, employeeCodeForEmail } from "../../../lib/employee-directory.ts";
import { fetchShiftForStaff } from "../../../lib/delivery-tasks-server.ts";
import { formatWorkDate } from "../../../lib/workflow-records.ts";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const user = await requireUser();
  const staffCode = employeeCodeForEmail(user.email) || null;
  const branch = staffCode ? branchFor(staffCode) : "bangkae";
  const workDate = formatWorkDate();
  // กะของวันนี้ตัดสินว่างานไหนเป็นของคุณ — ไม่ได้ลงกะก็ยังเห็นทั้งหมดไว้อ้างอิง
  const shift = staffCode ? await fetchShiftForStaff(branch, workDate, staffCode) : null;

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">งานวันนี้</p>
          <h2>งานประจำที่ต้องทำวันนี้</h2>
          <p>รวมงานรายวัน รายสัปดาห์ และรายเดือนที่ครบกำหนดวันนี้ — ทำเสร็จแล้วส่งตามแบบที่กำหนดไว้ในแต่ละงาน</p>
        </div>
      </section>
      <TodayTaskList
        branch={branch}
        date={workDate}
        shift={shift === "s1" || shift === "s2" ? shift : null}
        staffCode={staffCode}
        readOnly={user.isImpersonating}
      />
    </main>
  );
}
