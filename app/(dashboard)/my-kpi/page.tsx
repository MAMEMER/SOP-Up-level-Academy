import { loadLeaveData } from "../../../lib/leave-entitlement-server.ts";
import { LeaveSummary } from "../../../components/LeaveSummary.tsx";
import { SKILL_PART_ENABLED } from "../../../lib/kpi-v2-person-numbers.ts";
import { kpiV2Visible } from "../../../lib/launch-gate.ts";
import { notFound } from "next/navigation";
import Link from "next/link";
import { listStaff } from "../../../lib/staff-store.ts";
import { referralCount } from "../../../lib/referral-count-server.ts";
import { ReferralQr } from "../../../components/ReferralQr.tsx";
import { requireUser } from "../../../lib/auth.ts";
import { employeeCodeForEmail } from "../../../lib/employee-directory.ts";
import { formatWorkDate } from "../../../lib/workflow-records.ts";
import { isPeriod } from "../../../lib/peer-review.ts";
import { monthlyKpiV2 } from "../../../lib/kpi-v2-data.ts";
import { loadTodaySalesGoal } from "../../../lib/kpi-v2-person-server.ts";
import { groupLabels, missingLabels } from "../../../lib/kpi-v2-score.ts";

export const dynamic = "force-dynamic";
export default async function MyKpi({ searchParams }: { searchParams?: Promise<{ period?: string }> }) {
  const user = await requireUser(); if (!kpiV2Visible(user.role)) notFound();
  const staff = (await listStaff()).find(person => person.email === user.email.toLowerCase());
  const leaveYear = Number(formatWorkDate().slice(0, 4));
  const leave = staff?.code ? await loadLeaveData(leaveYear, [staff], formatWorkDate()).then(x => x.rows[0]).catch(() => null) : null;
  const referral = staff?.code ? await referralCount(staff.code).catch(() => null) : null;
  const params = await searchParams;
  const period = isPeriod(params?.period) ? params.period : formatWorkDate().slice(0, 7);
  const code = employeeCodeForEmail(user.email);
  const rows = code ? await monthlyKpiV2(period) : [];
  const row = rows.find(r => r.person.code === code);
  const today = code ? await loadTodaySalesGoal(code, formatWorkDate()).catch(() => null) : null;
  return <main className="page skill-review peer-review">
    <Link href="/my-view" className="back-link">← กลับหน้างานของฉัน</Link>
    <section className="board-hero"><div><p className="eyebrow">KPI รายเดือน</p><h2>คะแนนของฉัน</h2><p>คะแนนที่ยังไม่มีข้อมูลจะไม่นำมาคิดในคะแนนรวม</p></div>
      <form className="owner-ops__date"><label>เดือน<input type="month" name="period" defaultValue={period} /></label><button type="submit">ดู</button></form></section>
    {leave ? <LeaveSummary year={leaveYear} {...leave} startDate={staff?.startDate} /> : <p>ยังโหลดข้อมูลวันลาไม่ได้</p>}
    {staff?.code ? <ReferralQr code={staff.code} name={staff.name} count={referral} /> : <section className="owner-ops__panel"><p>ยังไม่มีรหัสพนักงาน ติดต่อแอดมิน</p></section>}
    <section className="owner-ops__panel"><Link href="/work-guide">อ่านงานพื้นฐานและสกิลทั้งหมด →</Link></section>
    {today && <section className="owner-ops__panel"><h3>เป้าวันนี้</h3>
      <p>เป้ายอดขายสินค้า {today.target === undefined ? "ยังไม่มีข้อมูล" : `${today.target.toLocaleString("th-TH", { maximumFractionDigits: 0 })} บาท`} · ขายแล้ว {today.sales === undefined ? "ยังไม่มีข้อมูล" : `${today.sales.toLocaleString("th-TH", { maximumFractionDigits: 0 })} บาท`}</p>
      <p>ชวนลูกค้ามาอีเวนต์ 1 คน และแสดงหน้าดอกไม้ทุกบิล</p></section>}
    {row ? <section className="owner-ops__panel"><h3>{row.name} · {row.trial ? "ทดลอง" : "ผลคะแนน"}</h3>
      <ul className="peer-review__mine">{row.groups.filter(g => g.weight > 0).map(g => <li key={g.group}><span>{groupLabels[g.group]} ({g.weight}%)</span><strong>{g.score === null ? "ไม่มีข้อมูล" : g.score.toFixed(1)}</strong></li>)}</ul>
      {SKILL_PART_ENABLED && row.person.numbers?.skill && <p>สกิลถึงระดับตามตำแหน่ง {row.person.numbers.skill.met} จาก {row.person.numbers.skill.required}</p>}
      <p>คะแนนรวม {row.total === null ? "ไม่มีข้อมูล" : row.total.toFixed(1)} · {row.trial && row.band === "เตือน" ? "ทดลอง" : row.band || "ไม่มีข้อมูล"}{row.trial ? " · ทดลอง ไม่นับเตือน" : ""}</p>
      {!row.incentiveEligible && <p>งานพื้นฐานต่ำกว่า 90 ไม่มีสิทธิ์ incentive</p>}
      {row.capped && <p>ติดเพดาน: ร้านยังไม่ถึง 90% ของเป้า</p>}
      {row.missing.length > 0 && <p>ยังไม่มีข้อมูล: {row.missing.map(part => missingLabels[part]).join(", ")}</p>}
      <Link href="/mistakes">ดูบันทึกความผิดและโต้แย้ง</Link></section> : <p>ยังไม่พบข้อมูลพนักงานสำหรับบัญชีนี้</p>}
  </main>;
}
