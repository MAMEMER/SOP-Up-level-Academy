import { redirect } from "next/navigation";
import Link from "next/link";
import { StoreTaskManager } from "../../../../components/StoreTaskManager.tsx";
import { requireUser } from "../../../../lib/auth.ts";

export const dynamic = "force-dynamic";

export default async function AdminTasksPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  return (
    <main className="page">
      <Link href="/admin" className="back-link">← กลับ หน้ารวมงานจัดการ</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Tasks</p>
          <h2>สั่งงานประจำ</h2>
          <p>
            รายวัน / รายสัปดาห์ / รายเดือน อยู่ที่เดียวกัน ต่างกันแค่สั่งบ่อยแค่ไหนและลงวันไหน —
            ทุกงานตั้งได้เหมือนกัน: กะไหน · เริ่มทำได้ตั้งแต่ · ต้องจบไม่เกิน · ส่งงานแบบไหน · รายละเอียด
          </p>
        </div>
      </section>
      <StoreTaskManager branch="bangkae" />
    </main>
  );
}
