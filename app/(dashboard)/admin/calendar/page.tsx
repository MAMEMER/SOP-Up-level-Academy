import { redirect } from "next/navigation";
import Link from "next/link";
import { TaskCalendar } from "../../../../components/TaskCalendar.tsx";
import { requireUser } from "../../../../lib/auth.ts";
import { employeeDirectory } from "../../../../lib/employee-directory.ts";
import { buildTeamOptions } from "../../../../lib/team-options.ts";
import { formatWorkDate } from "../../../../lib/workflow-records.ts";

export const dynamic = "force-dynamic";

export default async function AdminCalendarPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  // ปฏิทินมอบหมายงานเดี่ยว/กลุ่มได้จากวันที่กด จึงต้องรู้จักคนและทีมเหมือนหน้า /admin/projects
  const staff = employeeDirectory
    .filter((entry) => entry.branch === "bangkae")
    .map((entry) => ({ code: entry.code, displayName: entry.displayName, employmentType: entry.employmentType }));
  const teams = buildTeamOptions(employeeDirectory);

  return (
    <main className="page">
      <Link href="/admin" className="back-link">← กลับ หน้ารวมงานจัดการ</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Calendar</p>
          <h2>ปฏิทินสั่งงาน</h2>
          <p>
            เห็นทั้งเดือนว่าวันไหนมีงานอะไร วันไหนมีกิจกรรมอะไร — กดวันที่ต้องการแล้วมอบหมายงานเดี่ยว/กลุ่ม
            หรือสั่งงานประจำของวันนั้นได้เลย จะสั่งเป็น &quot;ทุกวันที่มีกิจกรรมนั้น&quot; ให้ระบบลงวันให้เองก็ได้
          </p>
        </div>
      </section>
      <TaskCalendar branch="bangkae" today={formatWorkDate()} staff={staff} teams={teams} />
    </main>
  );
}
