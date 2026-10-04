import { redirect } from "next/navigation";
import Link from "next/link";
import { ActivityBoard } from "../../../../components/ActivityBoard.tsx";
import { requireUser } from "../../../../lib/auth.ts";
import { isOwner } from "../../../../lib/owner.ts";
import { formatWorkDate } from "../../../../lib/workflow-records.ts";

export const dynamic = "force-dynamic";

// ตารางกิจกรรมสองสาขา — เฉพาะเจ้าของ. วางกิจกรรมรายสัปดาห์ของบางแค/เสนาเฟสต์
// แล้วเห็นในช่องเดียวกันว่าวันนั้นใครเข้ากะสาขาไหน.
export default async function AdminActivitiesPage() {
  const user = await requireUser();
  if (user.role !== "admin" || !isOwner(user.email)) redirect("/admin");

  return (
    <main className="page">
      <Link href="/admin" className="back-link">← กลับ หน้ารวมงานจัดการ</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">บางแค × เสนาเฟสต์</p>
          <h2>ตารางกิจกรรมสองสาขา</h2>
          <p>วันไหนจัดอะไร สาขาไหน และใครเข้ากะอยู่ที่ไหน — ดูในตารางเดียว ลากการ์ดย้ายวัน/สาขาได้ แตะการ์ดเพื่อแก้</p>
        </div>
      </section>
      <ActivityBoard today={formatWorkDate()} canEdit={!user.isImpersonating} />
    </main>
  );
}
