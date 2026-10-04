import Link from "next/link";
import { BellRing } from "lucide-react";
import { TaskFile } from "../../../../components/TaskFile.tsx";
import { requireUser } from "../../../../lib/auth.ts";
import { employeeCodeForEmail } from "../../../../lib/employee-directory.ts";
import { isMonthKey } from "../../../../lib/project-month.ts";
import { formatWorkDate } from "../../../../lib/workflow-records.ts";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<{ month?: string }> };

// แฟ้มงานของฉัน — แยกเดือน · กำลังทำ / ต้องแก้ไข / รอตรวจ / เรียบร้อย · เขียว = ผ่าน แดง = ต้องแก้/โดนหัก
export default async function MyTaskFilePage({ searchParams }: PageProps) {
  const user = await requireUser();
  const staffCode = employeeCodeForEmail(user.email) || null;
  const month = (await searchParams)?.month;

  return (
    <main className="page ti-page">
      <header className="ti-hero">
        <div>
          <h2>แฟ้มงาน</h2>
          <p>งานทั้งหมดของฉันแยกตามเดือน เขียว = ผ่าน · แดง = ต้องแก้ไขหรือโดนหักคะแนน</p>
        </div>
        <Link href="/my-tasks" className="ti-btn ti-btn--soft">
          <BellRing size={16} aria-hidden /> แจ้งเตือนงาน
        </Link>
      </header>
      {staffCode ? (
        <TaskFile codes={[staffCode]} today={formatWorkDate()} initialMonth={isMonthKey(month) ? month : undefined} />
      ) : (
        <p className="ti-empty">บัญชีนี้ยังไม่ผูกกับรหัสพนักงาน</p>
      )}
    </main>
  );
}
