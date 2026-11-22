import Link from "next/link";
import { KpiDraftForm } from "../../../../components/KpiDraftForm.tsx";
import { redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth.ts";
import { isOwner } from "../../../../lib/owner.ts";
import { isPeriod, previousPeriod } from "../../../../lib/peer-review.ts";
import { listStaff } from "../../../../lib/staff-store.ts";
import { formatWorkDate } from "../../../../lib/workflow-records.ts";
import { copyPersonTargetIfMissing, getPersonTargets, savePersonTarget, saveGrowthPct } from "../../../../lib/kpi-v2-person-store.ts";

import { loadSalesOverview } from "../../../../lib/kpi-v2-person-server.ts";

export const dynamic = "force-dynamic";
async function authorize() { const user = await requireUser(); if (!isOwner(user.actualEmail) || user.isImpersonating) redirect("/admin"); }
async function save(form: FormData) {
  "use server";
  await authorize();
  const period = String(form.get("period") || ""), code = String(form.get("code") || "");
  if (!isPeriod(period) || !(await listStaff()).some((person) => person.code === code && person.onRoster)) redirect("/admin/kpi-v2-targets?status=invalid");
  const values: Record<string, number> = {};
  for (const key of ["teachTarget", "memberTarget", "eventTarget", "assignedOnTimeTarget"]) {
    const raw = String(form.get(key) || "").trim();
    if (!raw) continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0 || (key === "assignedOnTimeTarget" && value > 100)) redirect(`/admin/kpi-v2-targets?period=${period}&status=invalid`);
    values[key] = value;
  }
  try { await savePersonTarget(period, code, values); } catch { redirect(`/admin/kpi-v2-targets?period=${period}&status=error`); }
  redirect(`/admin/kpi-v2-targets?period=${period}&status=saved`);
}
async function saveGrowth(form: FormData) {
  "use server";
  await authorize();
  const period = String(form.get("period") || ""), raw = String(form.get("growthPct") || "").trim(), value = Number(raw);
  if (!isPeriod(period) || !raw || !Number.isFinite(value) || value < 0 || value > 1000) redirect(`/admin/kpi-v2-targets?period=${period}&status=invalid`);
  try { await saveGrowthPct(period, value); } catch { redirect(`/admin/kpi-v2-targets?period=${period}&status=error`); }
  redirect(`/admin/kpi-v2-targets?period=${period}&status=saved`);
}
async function copy(form: FormData) {
  "use server";
  await authorize();
  const period = String(form.get("period") || "");
  if (!isPeriod(period)) redirect("/admin/kpi-v2-targets?status=invalid");
  try {
    const [old, current, staff] = await Promise.all([getPersonTargets(previousPeriod(period)), getPersonTargets(period), listStaff()]);
    for (const person of staff.filter((entry) => entry.onRoster && entry.code)) if (old[person.code] && !current[person.code]) await copyPersonTargetIfMissing(period, person.code, Object.fromEntries(Object.entries(old[person.code]).filter(([, value]) => value !== undefined)));
  } catch { redirect(`/admin/kpi-v2-targets?period=${period}&status=error`); }
  redirect(`/admin/kpi-v2-targets?period=${period}&status=copied`);
}
export default async function Targets({ searchParams }: { searchParams: Promise<{ period?: string; status?: string }> }) {
  await authorize();
  const params = await searchParams, period = isPeriod(params.period) ? params.period : formatWorkDate().slice(0, 7);
  const [staff, targets, overview] = await Promise.all([listStaff(), getPersonTargets(period).catch(() => null), loadSalesOverview(period).catch(() => null)]);
  const messages: Record<string, string> = { saved: "บันทึกแล้ว", copied: "คัดลอกเป้าที่ยังไม่ได้ตั้งแล้ว", error: "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง", invalid: "กรุณาตรวจสอบข้อมูล" };
  return <main className="page skill-review kpi-person-page"><Link href="/admin" className="back-link">← กลับหน้าแอดมิน</Link><section className="board-hero"><div><h2>เป้าหมาย KPI รายคน</h2><p>เว้นว่างรายการที่ยังไม่ตั้งเป้า</p></div><form className="owner-ops__date"><label>เดือน <input type="month" name="period" defaultValue={period} /></label><button>ดู</button></form></section>
  {params.status && messages[params.status] ? <p className="input-status">{messages[params.status]}</p> : null}
  {overview ? <section><h3>ยอดขายและเป้าตามกะ</h3><KpiDraftForm storageKey={`growth:${period}`} action={saveGrowth}><input type="hidden" name="period" value={period} /><label>เพิ่มจากค่าเฉลี่ย (%) <input type="number" name="growthPct" min="0" max="1000" step="any" defaultValue={overview.growthPct} /></label><button>บันทึก</button></KpiDraftForm><p>ยอดขายร้าน (ไม่รวมพรีออเดอร์): {overview.storeRevenue.toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท</p><p>ตรวจสอบยอดขายได้ทุกอย่าง: {overview.openPrice.toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท (ไม่นับในยอดขายสินค้า)</p><p>ไม่มีชื่อคนขาย: {overview.unnamed.toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท</p><div className="kpi-sales-table"><table><thead><tr><th>พนักงาน</th><th>กะ</th><th>เป้า (บาท)</th><th>ยอดขาย (บาท)</th><th>คะแนน</th></tr></thead><tbody>{staff.filter(p => p.onRoster && p.code).map(p => { const data = overview.people[p.code]; const sales = overview.sales[p.code] || 0; const score = data?.target ? Math.min(100, sales / data.target * 100) : undefined; return <tr key={p.code}><td>{p.name || p.code}</td><td>{data?.shifts || 0}</td><td>{data?.target === undefined ? "ไม่มีข้อมูล" : data.target.toLocaleString("th-TH", { maximumFractionDigits: 2 })}</td><td>{sales.toLocaleString("th-TH", { maximumFractionDigits: 2 })}</td><td>{score === undefined ? "ไม่มีข้อมูล" : score.toFixed(1)}</td></tr>; })}</tbody></table></div><h3>เป้าต่อกะจาก 8 สัปดาห์ก่อน</h3><div className="kpi-sales-table"><table><thead><tr><th>สาขาและประเภทวัน</th><th>จำนวนกะ</th><th>เป้าต่อกะ (บาท)</th></tr></thead><tbody>{Object.entries(overview.buckets).map(([key, value]) => <tr key={key}><td>{key.replace("bangkae", "บางแค").replace("senafest", "เสนาเฟสท์").replace(":weekday", " วันธรรมดา").replace(":weekend", " วันเสาร์–อาทิตย์")}</td><td>{value.shifts}</td><td>{value.target.toLocaleString("th-TH", { maximumFractionDigits: 2 })}</td></tr>)}</tbody></table></div></section> : <p>ไม่สามารถโหลดยอดขายและตารางกะได้</p>}
  {targets === null ? <p>ไม่สามารถโหลดเป้าหมายได้</p> : <><form action={copy}><input type="hidden" name="period" value={period} /><button type="submit">คัดลอกจากเดือนก่อนเฉพาะคนที่ยังไม่มีเป้า</button></form>{staff.filter((person) => person.onRoster && person.code).map((person) => <KpiDraftForm storageKey={`person-target:${period}:${person.code}`} action={save} className="owner-ops__panel kpi-entry-form" key={person.code}><h3>{person.name || person.code}</h3><input type="hidden" name="period" value={period} /><input type="hidden" name="code" value={person.code} /><label>สอนเกม (ครั้ง) <input type="number" min="0.01" step="any" name="teachTarget" defaultValue={targets[person.code]?.teachTarget ?? ""} /></label><label>แนะนำสมาชิก (คน) <input type="number" min="0.01" step="any" name="memberTarget" defaultValue={targets[person.code]?.memberTarget ?? ""} /></label><label>แนะนำลูกค้าอีเวนต์ (คน) <input type="number" min="0.01" step="any" name="eventTarget" defaultValue={targets[person.code]?.eventTarget ?? ""} /></label><label>งานผ่านตรงเวลา (%) <input type="number" min="0.01" max="100" step="any" name="assignedOnTimeTarget" defaultValue={targets[person.code]?.assignedOnTimeTarget ?? ""} /></label><button type="submit" className="btn-cute">บันทึก</button></KpiDraftForm>)}</>}
  </main>;
}
