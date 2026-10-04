import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { TaskInbox } from "../../../components/TaskInbox.tsx";
import { requireUser } from "../../../lib/auth.ts";
import { employeeCodeForEmail } from "../../../lib/employee-directory.ts";
import { workBranchFor } from "../../../lib/delivery-tasks-server.ts";
import { formatWorkDate } from "../../../lib/workflow-records.ts";

export const dynamic = "force-dynamic";

// หน้าแจ้งเตือนงาน — งานที่เจ้าของมอบหมายและยังไม่ได้ส่งสมบูรณ์ (แยกจากกระดิ่ง notification)
export default async function MyTasksPage() {
  const user = await requireUser();
  const staffCode = employeeCodeForEmail(user.email) || null;
  const today = formatWorkDate();
  const branch = await workBranchFor(staffCode, today);

  return (
    <main className="page ti-page">
      <header className="ti-hero">
        <div>
          <h2>แจ้งเตือนงาน</h2>
          <p>งานที่ได้รับมอบหมาย อยู่ตรงนี้จนกว่าจะกดส่งงานสมบูรณ์พร้อมรูปหลักฐาน</p>
        </div>
        <Link href="/my-tasks/file" className="ti-btn ti-btn--soft">
          <FolderOpen size={16} aria-hidden /> แฟ้มงาน
        </Link>
      </header>
      <TaskInbox branch={branch} staffCode={staffCode} today={today} readOnly={user.isImpersonating} />
    </main>
  );
}
