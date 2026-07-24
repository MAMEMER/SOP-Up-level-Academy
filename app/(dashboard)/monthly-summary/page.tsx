import Link from "next/link";
import { redirect } from "next/navigation";
import { MonthlySummaryMonitor } from "../../../components/MonthlySummaryMonitor.tsx";
import { requireUser } from "../../../lib/auth.ts";
import { isPreviewMode } from "../../../lib/preview-data.ts";

export default async function MonthlySummaryPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">monthly monitor</p>
          <h2>สรุปข้อมูลประจำเดือน</h2>
          <p>ติดตามจำนวนงานที่ส่งตรวจ ความครบถ้วนของ checklist และรายการที่ต้องตามต่อในเดือนนี้</p>
        </div>
      </section>
      <MonthlySummaryMonitor />
    </main>
  );
}
