import Link from "next/link";
import { KpiDraftForm } from "../../../../components/KpiDraftForm.tsx";
import { redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth.ts";
import { isOwner } from "../../../../lib/owner.ts";
import { isPeriod, previousPeriod } from "../../../../lib/peer-review.ts";
import { listStaff } from "../../../../lib/staff-store.ts";
import { formatWorkDate } from "../../../../lib/workflow-records.ts";
import { copyPersonTargetIfMissing, getPersonTargets, savePersonTarget } from "../../../../lib/kpi-v2-person-store.ts";

export const dynamic = "force-dynamic";
async function authorize() { const user = await requireUser(); if (!isOwner(user.actualEmail) || user.isImpersonating) redirect("/admin"); }
async function save(form: FormData) {
  "use server";
  await authorize();
  const period = String(form.get("period") || ""), code = String(form.get("code") || "");
  if (!isPeriod(period) || !(await listStaff()).some((person) => person.code === code && person.onRoster)) redirect("/admin/kpi-v2-targets?status=invalid");
  const values: Record<string, number> = {};
  for (const key of ["teachTarget", "addonSalesTarget", "assignedOnTimeTarget"]) {
    const raw = String(form.get(key) || "").trim();
    if (!raw) continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0 || (key === "assignedOnTimeTarget" && value > 100)) redirect(`/admin/kpi-v2-targets?period=${period}&status=invalid`);
    values[key] = value;
  }
  try { await savePersonTarget(period, code, values); } catch { redirect(`/admin/kpi-v2-targets?period=${period}&status=error`); }
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
  const [staff, targets] = await Promise.all([listStaff(), getPersonTargets(period).catch(() => null)]);
  const messages: Record<string, string> = { saved: "บันทึกแล้ว", copied: "คัดลอกเป้าที่ยังไม่ได้ตั้งแล้ว", error: "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง", invalid: "กรุณาตรวจสอบข้อมูล" };
  return <main className="page skill-review kpi-person-page"><Link href="/admin" className="back-link">← กลับหน้าแอดมิน</Link><section className="board-hero"><div><h2>เป้าหมาย KPI รายคน</h2><p>เว้นว่างรายการที่ยังไม่ตั้งเป้า</p></div><form className="owner-ops__date"><label>เดือน <input type="month" name="period" defaultValue={period} /></label><button>ดู</button></form></section>
  {params.status && messages[params.status] ? <p className="input-status">{messages[params.status]}</p> : null}
  {targets === null ? <p>ไม่สามารถโหลดเป้าหมายได้</p> : <><form action={copy}><input type="hidden" name="period" value={period} /><button type="submit">คัดลอกจากเดือนก่อนเฉพาะคนที่ยังไม่มีเป้า</button></form>{staff.filter((person) => person.onRoster && person.code).map((person) => <KpiDraftForm storageKey={`person-target:${period}:${person.code}`} action={save} className="owner-ops__panel kpi-entry-form" key={person.code}><h3>{person.name || person.code}</h3><input type="hidden" name="period" value={period} /><input type="hidden" name="code" value={person.code} /><label>สอนเกม (ครั้ง) <input type="number" min="0.01" step="any" name="teachTarget" defaultValue={targets[person.code]?.teachTarget ?? ""} /></label><label>ยอดขาย (บาท) <input type="number" min="0.01" step="any" name="addonSalesTarget" defaultValue={targets[person.code]?.addonSalesTarget ?? ""} /></label><label>งานผ่านตรงเวลา (%) <input type="number" min="0.01" max="100" step="any" name="assignedOnTimeTarget" defaultValue={targets[person.code]?.assignedOnTimeTarget ?? ""} /></label><button type="submit" className="btn-cute">บันทึก</button></KpiDraftForm>)}</>}
  </main>;
}
