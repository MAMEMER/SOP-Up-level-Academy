import { redirect } from "next/navigation";
import Link from "next/link";
import { TaskCalendar } from "../../../../components/TaskCalendar.tsx";
import { requireUser } from "../../../../lib/auth.ts";
import { formatWorkDate } from "../../../../lib/workflow-records.ts";

export const dynamic = "force-dynamic";

export default async function AdminCalendarPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  return (
    <main className="page">
      <Link href="/admin" className="back-link">← กลับ หน้ารวมงานจัดการ</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Calendar</p>
          <h2>ปฏิทินสั่งงาน</h2>
          <p>
            เห็นทั้งเดือนว่าวันไหนมีงานอะไร วันไหนมีกิจกรรมอะไร — กดวันที่ต้องการแล้วสั่งงานได้เลย
            หรือสั่งเป็น &quot;ทุกวันที่มีกิจกรรมนั้น&quot; ให้ระบบลงวันให้เอง
          </p>
        </div>
      </section>
      <TaskCalendar branch="bangkae" today={formatWorkDate()} />
    </main>
  );
}
