import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth.ts";
import { isOwner } from "../../../../lib/owner.ts";
import { getFlowerMonth } from "../../../../lib/flower-target-server.ts";
import { FlowerTargetForm } from "../../../../components/FlowerTargetForm.tsx";

// เป้าดอกไม้ขั้นต่ำต่อคนต่อเดือน — เจ้าของตั้ง แถบเตือนบนหน้าพนักงานอ่านค่าจากที่นี่

export const dynamic = "force-dynamic";

export default async function FlowerTargetPage() {
  const user = await requireUser();
  if (!isOwner(user.actualEmail)) redirect("/admin");
  const initial = await getFlowerMonth();

  return (
    <main className="page sdoc-page">
      <Link href="/admin" className="back-link">← ศูนย์รวมงานจัดการ</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">ดอกไม้ · เฉพาะเจ้าของ</p>
          <h2>เป้าดอกไม้ขั้นต่ำ</h2>
          <p>พนักงานแต่ละคนควรได้ดอกไม้เท่าไหร่ต่อเดือน เทียบกับยอดขายที่เข้าร้าน · ยังไม่มีบทลงโทษ ไม่ผูก KPI</p>
        </div>
      </section>
      <FlowerTargetForm initial={initial} />
    </main>
  );
}
