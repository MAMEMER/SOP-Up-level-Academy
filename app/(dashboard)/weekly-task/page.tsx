import Link from "next/link";
import { WeeklyEventChecklist } from "../../../components/WeeklyEventChecklist.tsx";
import { requireUser } from "../../../lib/auth.ts";

export default async function WeeklyTaskPage() {
  await requireUser();

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Weekly event</p>
          <h2>Checklist งานกิจกรรมประจำสัปดาห์</h2>
          <p>
            บันทึกงานหลักของวันกิจกรรม (Gym Pokémon / ป้ายยา Lorcana / Rift Bound) ตั้งแต่ Final ของแจก
            เตรียมพื้นที่ เตรียมเว็บ pairing เริ่มกิจกรรม ลงผลแต่ละรอบในกลุ่ม LINE จนถึงสรุปและประกาศของรางวัล
          </p>
        </div>
      </section>
      <WeeklyEventChecklist />
    </main>
  );
}
