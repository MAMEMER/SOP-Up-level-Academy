import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth.ts";
import { isOwner } from "../../../../lib/owner.ts";
import { getFlowerMonth } from "../../../../lib/flower-target-server.ts";
import { bloomLabel } from "../../../../lib/flower-garden.ts";
import { flowerMonthsSince, thaiMonthLabel } from "../../../../lib/flower-target.ts";
import { FlowerTargetForm } from "../../../../components/FlowerTargetForm.tsx";

const baht = (n: number) => `${Math.round(n).toLocaleString("th-TH")} ฿`;

// เป้าดอกไม้ขั้นต่ำต่อคนต่อเดือน — เจ้าของตั้ง แถบเตือนบนหน้าพนักงานอ่านค่าจากที่นี่

export const dynamic = "force-dynamic";

export default async function FlowerTargetPage() {
  const user = await requireUser();
  if (!isOwner(user.actualEmail)) redirect("/admin");
  const initial = await getFlowerMonth();
  // ย้อนหลังทุกเดือนตั้งแต่เริ่มระบบ (เดือนนี้รวมด้วย ให้เทียบกันได้ในตารางเดียว)
  const history = await Promise.all(
    flowerMonthsSince(initial.settings.startDate).map((month) => (month === initial.month ? initial : getFlowerMonth(month)))
  );

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

      <section className="sdoc-section flower-history">
        <p className="eyebrow">ย้อนหลังรายเดือน</p>
        <ul className="flower-history-list">
          {history.map((month) => {
            const leader = month.leaderboard[0];
            const winners = leader && leader.netPetals > 0 ? month.leaderboard.filter((row) => row.rank === 1) : [];
            const reached = month.targetPetals > 0 ? month.leaderboard.filter((row) => row.netPetals >= month.targetPetals).length : 0;
            return (
              <li key={month.month}>
                <Link href={`/flowers?month=${month.month}`} className="flower-history-row">
                  <span className="flower-history-month">
                    {thaiMonthLabel(month.month)}
                    <small>{month.month === initial.month ? "เดือนนี้" : "ปิดรอบแล้ว"}</small>
                  </span>
                  <span>
                    <small>ยอดขาย</small>
                    {baht(month.salesBaht)}
                  </span>
                  <span>
                    <small>เป้าต่อคน</small>
                    {month.targetPetals > 0 ? bloomLabel(month.targetPetals) : "—"}
                  </span>
                  <span>
                    <small>ถึงเป้า</small>
                    {reached} / {month.leaderboard.length} คน
                  </span>
                  <span className="flower-history-winner">
                    <small>ได้มากที่สุด</small>
                    {winners.length ? `${winners.map((row) => row.name).join(", ")} · ${bloomLabel(leader.netPetals)}` : "—"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="sdoc-hint">กดเดือนเพื่อดูอันดับเต็มและดอกไม้รายคน · เป้าของเดือนเก่าคิดจาก % ที่ตั้งไว้ตอนนี้ · พนักงานดูอันดับย้อนหลังได้ที่เมนู &ldquo;ดอกไม้&rdquo; (ไม่เห็นยอดขาย)</p>
      </section>
    </main>
  );
}
