import Link from "next/link";
import { redirect } from "next/navigation";
import { MonthlySummaryMonitor } from "../../../components/MonthlySummaryMonitor.tsx";
import { requireUser } from "../../../lib/auth.ts";
import { getMonthlyTeamRecordsByStaff } from "../../../lib/ops-summary.ts";
import { formatWorkDate } from "../../../lib/workflow-records.ts";

export default async function MonthlySummaryPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const today = formatWorkDate();
  const monthKey = today.slice(0, 7);
  const records = await getMonthlyTeamRecordsByStaff(monthKey);

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">monthly monitor</p>
          <h2>สรุปข้อมูลประจำเดือน</h2>
          <p>เลือกวันที่และประเภทงานเพื่อดูว่าพนักงานแต่ละคนส่งงานอะไรบ้าง ตรงเวลาหรือไม่</p>
        </div>
      </section>
      <MonthlySummaryMonitor records={records} monthKey={monthKey} today={today} />
    </main>
  );
}
