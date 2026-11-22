import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth.ts";
import { isOwner } from "../../../../lib/owner.ts";
import { isPeriod } from "../../../../lib/peer-review.ts";
import { formatWorkDate } from "../../../../lib/workflow-records.ts";
import { monthlyKpiV2 } from "../../../../lib/kpi-v2-data.ts";
import { groupLabels, positionLabels } from "../../../../lib/kpi-v2-score.ts";

export const dynamic = "force-dynamic";
export default async function AdminKpi({ searchParams }: { searchParams?: Promise<{ period?: string }> }) {
  const user = await requireUser();
  if (!isOwner(user.actualEmail) || user.isImpersonating) redirect("/admin");
  const params = await searchParams;
  const period = isPeriod(params?.period) ? params.period : formatWorkDate().slice(0, 7);
  const rows = await monthlyKpiV2(period);
  return <main className="page skill-review peer-review">
    <Link href="/admin" className="back-link">← กลับหน้าแอดมิน</Link>
    <section className="board-hero"><div><p className="eyebrow">KPI รายเดือน · เจ้าของ</p><h2>คะแนนพนักงาน</h2><p>{period < "2027-01" ? "รอบทดลอง ไม่นับเตือน" : "ผลคะแนนรายเดือน"} · หมวดที่ไม่มีข้อมูลจะไม่นำมาคิดคะแนนรวม</p></div>
      <form className="owner-ops__date"><label>เดือน<input type="month" name="period" defaultValue={period} /></label><button type="submit">ดู</button></form></section>
    {rows.map(row => <section className="owner-ops__panel" key={row.person.code}><h3>{row.name}</h3><p>{positionLabels[row.position]}{!row.person.position ? " · ยังไม่ได้ระบุตำแหน่ง (ใช้ประจำ)" : ""}</p>
      <ul className="peer-review__mine">{row.groups.map(g => <li key={g.group}><span>{g.group} {groupLabels[g.group]} ({g.weight}%)</span><strong>{g.weight === 0 ? "ไม่นับ" : g.score === null ? "ไม่มีข้อมูล" : g.score.toFixed(1)}</strong></li>)}</ul>
      <p>คะแนนรวม {row.total === null ? "ไม่มีข้อมูล" : row.total.toFixed(1)} · {row.band || "ไม่มีข้อมูล"}{row.trial ? " · ทดลอง" : ""}</p>
      {row.missing.length > 0 && <p>ยังไม่มีข้อมูล: {row.missing.join(", ")}</p>}</section>)}
  </main>;
}
