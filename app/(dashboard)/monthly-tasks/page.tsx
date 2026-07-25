import Link from "next/link";
import { MonthlyEventChecklist } from "../../../components/MonthlyEventChecklist.tsx";
import { requireUser } from "../../../lib/auth.ts";
import { isOwner } from "../../../lib/owner.ts";

export default async function MonthlyTasksPage() {
  const user = await requireUser();
  const canManage = user.role === "admin" || isOwner(user.email);

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Monthly tasks</p>
          <h2>งานประจำเดือน · Event / Stock</h2>
          <p>
            งานที่แอดมินมอบหมายให้ทำภายในเดือน แสดงงานของเดือนปัจจุบัน พร้อมสถานะ
            ยังไม่เริ่ม / กำลังทำ / ส่งตรวจแล้ว / เสร็จสิ้น / เลยกำหนด และกำหนดส่งสิ้นเดือน
          </p>
        </div>
      </section>
      <MonthlyEventChecklist canManage={canManage} />
    </main>
  );
}
