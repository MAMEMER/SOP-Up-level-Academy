import { LEAVE_KINDS, type Allowances } from "../lib/leave-entitlement.ts";
export const leaveLabels = { sick: "ลาป่วย", personal: "ลากิจ", vacation: "ลาพักร้อน" };
export function LeaveSummary({ year, used, allowed, remaining, startDate, admin = false }: {year:number; used:Allowances; allowed:Allowances; remaining:Allowances; startDate?:string; admin?:boolean}) {
  return <section className="owner-ops__panel"><h3>สิทธิ์วันลาของฉัน (ปี {year})</h3>
    <ul className="peer-review__mine">{LEAVE_KINDS.map(kind => <li key={kind}><span>{leaveLabels[kind]}</span><span>ใช้ {used[kind]} / สิทธิ์ {allowed[kind]} วัน · {admin && remaining[kind] < 0 ? <strong style={{color:"#b42318"}}>เกินสิทธิ์ {Math.abs(remaining[kind])} วัน</strong> : `คงเหลือ ${remaining[kind]} วัน`}</span></li>)}</ul>
    {!startDate && <p>ยังไม่มีวันเริ่มงาน ให้แอดมินใส่</p>}
  </section>;
}
