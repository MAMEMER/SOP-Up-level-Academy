import Link from "next/link";
import { requireUser } from "../../../lib/auth.ts";
import { employeeCodeForEmail } from "../../../lib/employee-directory.ts";
import { listStaff } from "../../../lib/staff-store.ts";
import { formatWorkDate } from "../../../lib/workflow-records.ts";
import { getConfig, listDeals } from "../../../lib/big-deal-store.ts";
import DealForm from "./DealForm.tsx";
export const dynamic = "force-dynamic";
const labels = {logged:"บันทึกแล้ว",manager_checked:"ตรวจแล้ว",approved:"อนุมัติแล้ว",paid:"จ่ายแล้ว",rejected:"ไม่อนุมัติ"};
export default async function Page({searchParams}:{searchParams:Promise<{status?:string}>}) {
 const user=await requireUser(); const code=employeeCodeForEmail(user.email) || ""; const today=formatWorkDate(); const params=await searchParams;
 const [staff,config,deals]=await Promise.all([listStaff(),getConfig().catch(()=>null),code?listDeals(today.slice(0,7),code).catch(()=>[]):[]]);
 const messages:Record<string,string>={saved:"บันทึกแล้ว",duplicate:"เลขใบเสร็จนี้ถูกบันทึกแล้ว",invalid:"กรุณาตรวจข้อมูลและสัดส่วนผู้ขาย",denied:"บัญชีนี้ไม่สามารถบันทึกได้",error:"บันทึกไม่สำเร็จ โปรดลองอีกครั้ง"};
 return <main className="page skill-review"><Link href="/" className="back-link">← กลับหน้าหลัก</Link><section className="board-hero"><div><p className="eyebrow">โบนัสการขาย</p><h2>บันทึก Big Deal</h2><p>บันทึกเลขรายการและสัดส่วนผู้ขาย เพื่อตรวจสอบโบนัส</p></div></section>
 {today.slice(0,7)<"2026-12" && <p className="input-status warning">ทดลองระบบ — เริ่มจ่ายจริง 1 ธ.ค.</p>}{params.status && <p className="input-status warning">{messages[params.status]}</p>}
 <section className="owner-ops__panel"><h3>รายการใหม่</h3><DealForm staff={staff.filter(s=>s.active && s.code).map(s=>({code:s.code,name:s.name}))} code={code} config={config} today={today} disabled={user.isImpersonating || !code}/></section>
 <section className="owner-ops__panel"><h3>รายการของฉันเดือนนี้</h3>{!deals.length && <p>ยังไม่มีรายการ</p>}{deals.map(d=><div className="skill-review__row" key={d.id}><strong>{d.date} · {d.receipt}</strong><p>{labels[d.status]}{d.reason ? ` · ${d.reason}` : ""}</p><p>ส่วนของฉัน {d.result.shares.find(s=>s.staffCode===code)?.amount.toLocaleString()} บาท</p></div>)}</section></main>;
}
