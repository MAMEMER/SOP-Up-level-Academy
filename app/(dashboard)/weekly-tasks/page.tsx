import Link from "next/link";
import { WeeklyEventChecklist } from "../../../components/WeeklyEventChecklist.tsx";
import { requireUser } from "../../../lib/auth.ts";
import { isOwner } from "../../../lib/owner.ts";

export default async function WeeklyTasksPage() {
  const user = await requireUser();
  const canManage = user.role === "admin" || isOwner(user.email);

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Weekly tasks</p>
          <h2>งานประจำสัปดาห์ · Gym Pokémon / Lorcana</h2>
          <p>
            งานกิจกรรมรายสัปดาห์ตามวันที่มีรอบจริง แสดงเฉพาะรอบของสัปดาห์นี้ พร้อมสถานะ
            รอตามรอบ / ยังไม่เริ่ม / เสร็จแล้ว / เลยกำหนด
          </p>
        </div>
      </section>
      <WeeklyEventChecklist canManage={canManage} />
    </main>
  );
}
