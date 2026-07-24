import Link from "next/link";
import { WeeklyStockChecklist } from "../../../components/WeeklyStockChecklist.tsx";
import { requireUser } from "../../../lib/auth.ts";

export default async function ChecklistWeeklyPage() {
  await requireUser();

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Weekly checklist</p>
          <h2>Checklist งานประจำสัปดาห์ · Stock อุปกรณ์ / Sleeve</h2>
          <p>นับ Stock อุปกรณ์ / Sleeve ประจำสัปดาห์ ตรวจของจริงหน้าร้านและห้อง Stock แล้วสรุปของที่ตรงและไม่ตรง</p>
        </div>
      </section>
      <WeeklyStockChecklist />
    </main>
  );
}
