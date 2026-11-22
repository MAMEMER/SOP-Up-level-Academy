import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth.ts";
import { isOwner } from "../../../../lib/owner.ts";
import { isPeriod } from "../../../../lib/peer-review.ts";
import { listStaff } from "../../../../lib/staff-store.ts";
import { formatWorkDate } from "../../../../lib/workflow-records.ts";
import { getTeachLogs } from "../../../../lib/kpi-v2-person-store.ts";

export const dynamic = "force-dynamic";
export default async function AdminTeachLog({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const user = await requireUser();
  if (!isOwner(user.actualEmail) || user.isImpersonating) redirect("/admin");
  const params = await searchParams;
  const period = isPeriod(params.period) ? params.period : formatWorkDate().slice(0, 7);
  const [staff, logs] = await Promise.all([listStaff(), getTeachLogs(period).catch(() => null)]);
  const counts = new Map<string, { sessions: number; customers: number }>();
  for (const log of logs || []) { const row = counts.get(log.staffCode) || { sessions: 0, customers: 0 }; row.sessions++; row.customers += log.customers; counts.set(log.staffCode, row); }
  return <main className="page skill-review kpi-person-page"><Link href="/admin" className="back-link">← กลับหน้าแอดมิน</Link><section className="board-hero"><div><h2>สรุปการสอนเกม</h2></div><form className="owner-ops__date"><label>เดือน <input type="month" name="period" defaultValue={period} /></label><button>ดู</button></form></section><section className="owner-ops__panel">{logs === null ? <p>ไม่สามารถโหลดรายการได้</p> : counts.size === 0 ? <p>ยังไม่มีรายการ</p> : [...counts].map(([code, row]) => <div className="skill-review__row" key={code}><strong>{staff.find((person) => person.code === code)?.name || code}</strong><p>{row.sessions} ครั้ง · ลูกค้า {row.customers} คน</p></div>)}</section></main>;
}
