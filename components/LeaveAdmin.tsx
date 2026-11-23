"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LEAVE_KINDS, type LeavePolicy, type Allowances, type Position } from "../lib/leave-entitlement.ts";
import { leaveLabels } from "./LeaveSummary.tsx";
const positions: Position[] = ["temporary", "regular", "branch_manager"];
const labels = {temporary:"ชั่วคราว",regular:"ประจำ",branch_manager:"ผู้จัดการสาขา"};
type Row = { person: { email:string; name:string; startDate?:string }; used:Allowances; allowed:Allowances; remaining:Allowances };
export function LeaveAdmin({policy:initial, rows, year}: {policy:LeavePolicy; rows:Row[]; year:number}) {
  const [policy,setPolicy] = useState(initial); const [message,setMessage] = useState(""); const router = useRouter();
  const [dates, setDates] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  useEffect(() => { try { const draft = localStorage.getItem("sop-leave-policy-draft"); if (draft) setPolicy(JSON.parse(draft)); const dateDraft = localStorage.getItem("sop-leave-date-draft"); if (dateDraft) setDates(JSON.parse(dateDraft)); } catch {} setReady(true); }, []);
  useEffect(() => { if (ready) localStorage.setItem("sop-leave-policy-draft", JSON.stringify(policy)); }, [policy, ready]);
  useEffect(() => { if (ready) localStorage.setItem("sop-leave-date-draft", JSON.stringify(dates)); }, [dates, ready]);
  async function save(body: unknown) { setMessage("กำลังบันทึก"); try { const res = await fetch("/api/leave",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}); if (!res.ok) throw Error(); setMessage("บันทึกแล้ว"); router.refresh(); } catch { setMessage("บันทึกไม่ได้ กรุณาลองใหม่"); } }
  return <><form className="owner-ops__date"><label>ปี <input type="number" name="year" min="2000" max="2100" defaultValue={year}/></label><button>ดู</button></form>
    <section className="owner-ops__panel"><h3>สิทธิ์รายตำแหน่ง</h3><p>จำนวนวันต่อปี</p>
      {positions.map(pos => <div key={pos}><h4>{labels[pos]}</h4><div className="staff-form__grid">{LEAVE_KINDS.map(kind => <label key={kind}>{leaveLabels[kind]}<input type="number" min="0" max="366" value={policy.byPosition[pos][kind]} onChange={e => setPolicy({...policy,byPosition:{...policy.byPosition,[pos]:{...policy.byPosition[pos],[kind]:Number(e.target.value)}}})}/></label>)}</div></div>)}
      <label>พักร้อนหลังทำงานครบ (เดือน)<input type="number" min="0" max="1200" value={policy.vacationAfterMonths} onChange={e=>setPolicy({...policy,vacationAfterMonths:Number(e.target.value)})}/></label><p><button className="primary-action" onClick={()=>save({action:"policy",policy})}>บันทึกสิทธิ์</button></p><button type="button" onClick={() => { localStorage.removeItem("sop-leave-policy-draft"); localStorage.removeItem("sop-leave-date-draft"); setPolicy(initial); setDates({}); }}>รีเซ็ต</button><p role="status">{message}</p></section>
    <section className="owner-ops__panel"><h3>วันลาพนักงาน</h3>{rows.map(row => <article key={row.person.email}><h4>{row.person.name}</h4><label>วันเริ่มงาน <input type="date" value={dates[row.person.email] ?? row.person.startDate ?? ""} onChange={e => setDates({...dates, [row.person.email]:e.target.value})}/></label> <button type="button" onClick={() => save({action:"startDate",email:row.person.email,startDate:dates[row.person.email] ?? row.person.startDate ?? ""})}>บันทึกวันเริ่มงาน</button>
      <ul className="peer-review__mine">{LEAVE_KINDS.map(kind => <li key={kind}><span>{leaveLabels[kind]}</span><span>ใช้ {row.used[kind]} / สิทธิ์ {row.allowed[kind]} วัน · {row.remaining[kind] < 0 ? <strong style={{color:"#b42318"}}>เกินสิทธิ์ {Math.abs(row.remaining[kind])} วัน</strong> : `คงเหลือ ${row.remaining[kind]} วัน`}</span></li>)}</ul></article>)}</section></>;
}
