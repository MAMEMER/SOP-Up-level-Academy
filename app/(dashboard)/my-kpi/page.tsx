import Link from "next/link";
import { requireUser } from "../../../lib/auth.ts";
import { employeeCodeForEmail } from "../../../lib/employee-directory.ts";
import { formatWorkDate } from "../../../lib/workflow-records.ts";
import { isPeriod } from "../../../lib/peer-review.ts";
import { monthlyKpiV2 } from "../../../lib/kpi-v2-data.ts";
import { groupLabels } from "../../../lib/kpi-v2-score.ts";

export const dynamic = "force-dynamic";
export default async function MyKpi({ searchParams }: { searchParams?: Promise<{ period?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const period = isPeriod(params?.period) ? params.period : formatWorkDate().slice(0, 7);
  const code = employeeCodeForEmail(user.email);
  const rows = code ? await monthlyKpiV2(period) : [];
  const row = rows.find(r => r.person.code === code);
  return <main className="page skill-review peer-review">
    <Link href="/my-view" className="back-link">← กลับหน้างานของฉัน</Link>
    <section className="board-hero"><div><p className="eyebrow">KPI รายเดือน</p><h2>คะแนนของฉัน</h2><p>คะแนนที่ยังไม่มีข้อมูลจะไม่นำมาคิดในคะแนนรวม</p></div>
      <form className="owner-ops__date"><label>เดือน<input type="month" name="period" defaultValue={period} /></label><button type="submit">ดู</button></form></section>
    {row ? <section className="owner-ops__panel"><h3>{row.name} · {row.trial ? "ทดลอง" : "ผลคะแนน"}</h3>
      <ul className="peer-review__mine">{row.groups.filter(g => g.weight > 0).map(g => <li key={g.group}><span>{g.group} {groupLabels[g.group]} ({g.weight}%){g.group === "3" && <small> · ขายและการตลาดของทั้งทีม 10%</small>}</span><strong>{g.score === null ? "ไม่มีข้อมูล" : g.score.toFixed(1)}</strong></li>)}</ul>
      <p>คะแนนรวม {row.total === null ? "ไม่มีข้อมูล" : row.total.toFixed(1)} · {row.band || "ไม่มีข้อมูล"}{row.trial ? " · ทดลอง ไม่นับเตือน" : ""}</p>
      {row.capped && <p>ติดเพดาน: ผลงานร้านยังไม่ถึง 90</p>}
      {row.missing.length > 0 && <p>ยังไม่มีข้อมูล: {row.missing.join(", ")}</p>}
      <Link href="/mistakes">ดูบันทึกความผิดและโต้แย้ง</Link></section> : <p>ยังไม่พบข้อมูลพนักงานสำหรับบัญชีนี้</p>}
  </main>;
}
