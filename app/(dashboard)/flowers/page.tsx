import Link from "next/link";
import { requireUser } from "../../../lib/auth.ts";
import { isOwner } from "../../../lib/owner.ts";
import { displayNameFor, employeeCodeForEmail, employeeCodes } from "../../../lib/employee-directory.ts";
import { resolveStaffViewSelection } from "../../../lib/staff-view.ts";
import { bangkokMonth, bloomLabel } from "../../../lib/flower-garden.ts";
import { flowerMonthsSince, isFlowerMonth, thaiMonthLabel } from "../../../lib/flower-target.ts";
import { getFlowerMonth } from "../../../lib/flower-target-server.ts";
import { FlowerBoard } from "../../../components/FlowerBoard.tsx";
import { FlowerGarden } from "../../../components/FlowerGarden.tsx";

// ดอกไม้ย้อนหลังรายเดือน — ทุกคนเปิดดูได้ (แชมป์สั่ง 1 ต.ค. 2569)
//
// ทุกคนเห็นอันดับของทั้งร้านเป็นกลีบ + สวนดอกไม้ของตัวเองในเดือนนั้น.
// ยอดขายเป็นบาทเห็นเฉพาะเจ้าของ (เหมือนหน้าตั้งเป้า). หัวหน้ากดชื่อเพื่อดูสวนของคนอื่นได้.
// เป้าของเดือนเก่าคิดจาก % ที่ตั้งไว้ตอนนี้ — ระบบไม่ได้เก็บประวัติการตั้ง %

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<{ month?: string; staff?: string }> };

const baht = (n: number) => `${Math.round(n).toLocaleString("th-TH")} ฿`;

export default async function FlowersHistoryPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const params = searchParams ? await searchParams : {};
  const admin = user.role === "admin";
  const owner = isOwner(user.actualEmail);
  const selfCode = employeeCodeForEmail(user.email);

  const current = bangkokMonth();
  const first = await getFlowerMonth(isFlowerMonth(params.month) ? params.month : current);
  const months = flowerMonthsSince(first.settings.startDate);
  const month = months.includes(first.month) ? first.month : current;
  const data = month === first.month ? first : await getFlowerMonth(month);
  const isCurrent = month === current;

  const { selectedCode } = resolveStaffViewSelection({
    isOwner: admin,
    selfCode,
    requestedCode: params.staff,
    validCodes: employeeCodes
  });

  const leader = data.leaderboard[0];
  const hasLeader = leader && leader.netPetals > 0;
  const winners = hasLeader ? data.leaderboard.filter((row) => row.rank === 1) : [];
  const reached = data.targetPetals > 0 ? data.leaderboard.filter((row) => row.netPetals >= data.targetPetals).length : 0;
  const query = (next: { month?: string; staff?: string | null }) => {
    const qs = new URLSearchParams();
    qs.set("month", next.month ?? month);
    const staff = next.staff === undefined ? (admin && selectedCode !== selfCode ? selectedCode : null) : next.staff;
    if (staff) qs.set("staff", staff);
    return `/flowers?${qs.toString()}`;
  };

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">ดอกไม้จากลูกค้า</p>
          <h2>ดอกไม้ย้อนหลัง</h2>
          <p>อันดับดอกไม้ของทั้งร้านในแต่ละเดือน และดอกไม้ที่คุณได้รับ — ไม่ผูกกับคะแนน KPI และไม่มีใครรู้ว่าลูกค้าคนไหนเป็นคนให้</p>
        </div>
      </section>

      <nav className="stock-loss-tabs" aria-label="เลือกเดือน">
        {months.map((key) => (
          <Link
            key={key}
            href={query({ month: key })}
            className={key === month ? "is-active" : undefined}
            aria-current={key === month ? "page" : undefined}
          >
            {thaiMonthLabel(key)}{key === current ? " (เดือนนี้)" : ""}
          </Link>
        ))}
      </nav>

      <section className="sdoc-section flower-history">
        <p className="eyebrow">{thaiMonthLabel(month)}{isCurrent ? " · ยังไม่ปิดรอบ" : " · ปิดรอบแล้ว"}</p>
        <div className="flower-target-stats">
          {owner ? <div><small>ยอดขายที่นับเข้าเป้า</small><strong>{baht(data.salesBaht)}</strong></div> : null}
          <div>
            <small>เป้าต่อคน ({data.settings.minPercentOfSales}% ของยอดขายร้าน)</small>
            <strong>{data.targetPetals > 0 ? bloomLabel(data.targetPetals) : "—"}</strong>
            {data.targetPetals > 0 ? <small>{data.targetPetals} กลีบ</small> : null}
          </div>
          <div>
            <small>{isCurrent ? "ตอนนี้นำอยู่" : "ได้ดอกไม้มากที่สุด"}</small>
            <strong>{winners.length ? winners.map((row) => row.name).join(", ") : "—"}</strong>
            {hasLeader ? <small>{bloomLabel(leader.netPetals)}</small> : null}
          </div>
          {data.targetPetals > 0 ? (
            <div><small>ถึงเป้า</small><strong>{reached} / {data.leaderboard.length} คน</strong></div>
          ) : null}
        </div>

        {hasLeader ? (
          <FlowerBoard
            rows={data.leaderboard}
            targetPetals={data.targetPetals}
            highlightCode={selfCode}
            hrefFor={admin ? (code) => query({ staff: code }) + "#garden" : undefined}
          />
        ) : (
          <p className="sdoc-hint">เดือนนี้ยังไม่มีใครได้ดอกไม้</p>
        )}
        <p className="sdoc-hint">
          ใบไม้แห้งหักล้างกับดอกไม้แล้ว · 5 กลีบ = 1 ดอก
          {data.settings.prize && hasLeader ? ` · รางวัลคนที่ได้มากที่สุด: ${data.settings.prize}` : ""}
          {admin ? " · กดชื่อเพื่อดูดอกไม้ของคนนั้น" : ""}
        </p>
      </section>

      {selectedCode ? (
        <div id="garden">
          {admin && selectedCode !== selfCode ? (
            <p className="eyebrow">สวนดอกไม้ของ {displayNameFor(selectedCode)}</p>
          ) : null}
          <FlowerGarden key={`${selectedCode}-${month}`} staffCode={selectedCode} month={month} />
        </div>
      ) : null}
    </main>
  );
}
