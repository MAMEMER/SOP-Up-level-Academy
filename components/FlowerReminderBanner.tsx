import Link from "next/link";
import { Flower2 } from "lucide-react";
import { employeeCodeForEmail } from "../lib/employee-directory.ts";
import { bloomLabel } from "../lib/flower-garden.ts";
import { daysLeftInMonth } from "../lib/flower-target.ts";
import { getFlowerMonth } from "../lib/flower-target-server.ts";

// แถบเตือนดอกไม้ — ขึ้นบนหน้าหลักของพนักงานทุกวันตามที่แชมป์สั่ง (28 ก.ย. 2569):
// "อย่าลืมให้ลูกค้ากดดอกไม้ ไม่งั้นจะไม่ถึงเป้า" + ใครได้มากสุดมีรางวัลพิเศษ.
// เตือนอย่างเดียว ไม่ผูก KPI ไม่หักคะแนน. อ่านพลาด = ไม่ขึ้นแถบ (ไม่ทำให้หน้าพัง).
export async function FlowerReminderBanner({ email }: { email: string | null | undefined }) {
  const staffCode = employeeCodeForEmail(email);
  if (!staffCode) return null;
  try {
    const month = await getFlowerMonth();
    const me = month.leaderboard.find((row) => row.staffCode === staffCode);
    if (!me) return null;
    const target = month.targetPetals;
    const pct = target > 0 ? Math.round((me.netPetals / target) * 100) : null;
    const reached = pct !== null && pct >= 100;
    const leader = month.leaderboard[0];
    const leading = leader && leader.netPetals > 0 && me.rank === 1;
    const days = daysLeftInMonth();
    const prize = month.settings.prize ? `: ${month.settings.prize}` : "";

    return (
      <Link href="/my-review" className={reached ? "flower-banner is-reached" : "flower-banner"}>
        <Flower2 className="flower-banner-icon" aria-hidden />
        <span className="flower-banner-body">
          <span className="flower-banner-title">
            {reached ? "ถึงเป้าดอกไม้แล้ว — ชวนลูกค้าต่อ ลุ้นอันดับ 1" : "อย่าลืมชวนลูกค้ากดให้ดอกไม้ทุกบิล ไม่งั้นจะไม่ถึงเป้า"}
          </span>
          <span className="flower-banner-detail">
            {target > 0
              ? `เดือนนี้ได้ ${bloomLabel(me.netPetals)} จากเป้า ${bloomLabel(target)} (${pct}%) · เหลือ ${days} วัน`
              : `เดือนนี้ได้ ${bloomLabel(me.netPetals)} · เป้าขั้นต่ำ ${month.settings.minPercentOfSales}% ของยอดขายร้าน`}
          </span>
          <span className="flower-banner-prize">
            ใครได้ดอกไม้มากที่สุดเดือนนี้ รับรางวัลพิเศษ{prize}
            {leading ? " · ตอนนี้คุณนำอยู่" : leader && leader.netPetals > 0 ? ` · ตอนนี้ ${leader.name} นำ (${bloomLabel(leader.netPetals)})` : ""}
          </span>
        </span>
        <span className="flower-banner-cta">ดูสวนดอกไม้</span>
      </Link>
    );
  } catch {
    return null;
  }
}
