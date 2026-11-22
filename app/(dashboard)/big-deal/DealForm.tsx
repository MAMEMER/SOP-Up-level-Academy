"use client";
import { useEffect, useState } from "react";
import { calculateBigDeal, validateShares, type BigDealConfig, type DealShare } from "../../../lib/big-deal.ts";
import { submitDeal } from "./actions.ts";

type Staff = { code: string; name: string };
export default function DealForm({ staff, code, config, today, disabled }: {staff: Staff[]; code: string; config: BigDealConfig | null; today: string; disabled: boolean}) {
  const [date,setDate] = useState(today); const [receipt,setReceipt] = useState(""); const [total,setTotal] = useState(""); const [note,setNote] = useState("");
  const [shares,setShares] = useState<DealShare[]>([{staffCode:code,percent:100}]); const [loaded,setLoaded] = useState(false);
  const key = `big-deal-draft:${code}`;
  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem(key) || "null"); if (saved) { setDate(saved.date); setReceipt(saved.receipt); setTotal(saved.total); setNote(saved.note); setShares(saved.shares); } } catch {} setLoaded(true); }, [key]);
  useEffect(() => { if (loaded) localStorage.setItem(key, JSON.stringify({date,receipt,total,note,shares})); }, [key,loaded,date,receipt,total,note,shares]);
  const preview = config && /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(date) && validateShares(shares) && Number(total) > 0 ? calculateBigDeal(Number(total),config,shares,date.slice(0,7),[]) : null;
  return <form action={submitDeal} className="skill-review__levels big-deal-form">
    <label>วันที่<input name="date" type="date" value={date} onChange={e=>setDate(e.target.value)} required /></label>
    <label>เลขใบเสร็จ / รายการ StoreHub<input name="receipt" value={receipt} onChange={e=>setReceipt(e.target.value)} maxLength={100} required /></label>
    <label>ยอดรวม (บาท)<input name="total" type="number" min="0.01" step="0.01" value={total} onChange={e=>setTotal(e.target.value)} required /></label>
    <label>หมายเหตุลูกค้า (ไม่ต้องระบุข้อมูลส่วนตัว)<textarea name="note" value={note} onChange={e=>setNote(e.target.value)} maxLength={500} /></label>
    <fieldset><legend>สัดส่วนผู้ขาย</legend>{shares.map((s,i)=><div className="big-deal-share" key={i}><select aria-label="พนักงาน" value={s.staffCode} onChange={e=>setShares(shares.map((x,j)=>j===i?{...x,staffCode:e.target.value}:x))}><option value="">เลือกพนักงาน</option>{staff.map(p=><option key={p.code} value={p.code}>{p.name}</option>)}</select><input aria-label="สัดส่วนเปอร์เซ็นต์" type="number" min="1" max="100" step="1" value={s.percent} onChange={e=>setShares(shares.map((x,j)=>j===i?{...x,percent:Number(e.target.value)}:x))}/><span>%</span><button type="button" onClick={()=>setShares(shares.filter((_,j)=>j!==i))}>ลบ</button></div>)}<button type="button" onClick={()=>setShares([...shares,{staffCode:"",percent:0}])}>เพิ่มผู้ขาย</button></fieldset>
    <input type="hidden" name="shares" value={JSON.stringify(shares)}/>
    <p>{!config ? "ยังไม่ได้ตั้งค่า" : preview ? `โบนัสประมาณ ${preview.bonus.toLocaleString()} บาท (ตรวจสิทธิ์อีกครั้งเมื่ออนุมัติ)` : "ระบุยอดและสัดส่วนให้รวมกัน 100% เพื่อดูโบนัส"}</p>
    <div><button type="submit" disabled={disabled || !config || !validateShares(shares) || !shares.some(s=>s.staffCode===code)}>บันทึกรายการ</button> <button type="button" onClick={()=>{setDate(today);setReceipt("");setTotal("");setNote("");setShares([{staffCode:code,percent:100}]);}}>ล้างข้อมูล</button></div>
  </form>;
}
