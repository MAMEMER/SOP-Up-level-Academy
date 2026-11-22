"use client";
import { useEffect, useState } from "react";
import { GAMES, type SellGroup } from "../lib/sell-post.ts";
import { saveGroups } from "../app/(dashboard)/admin/sell-groups/actions.ts";
export function GroupEditor({initial, readOnly}: {initial: SellGroup[]; readOnly: boolean}) {
 const [groups,setGroups]=useState(initial); const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false); const [ready,setReady]=useState(false);
 useEffect(()=>{try{const draft=localStorage.getItem("sop-sell-groups-draft");if(draft)setGroups(JSON.parse(draft));}catch{}setReady(true);},[]);
 useEffect(()=>{if(ready)localStorage.setItem("sop-sell-groups-draft",JSON.stringify(groups));},[groups,ready]);
 function edit(i:number, patch:Partial<SellGroup>) {setGroups(groups.map((g,n)=>n===i?{...g,...patch}:g));}
 async function save(){setBusy(true);setMessage("");try{await saveGroups(groups);localStorage.removeItem("sop-sell-groups-draft");setMessage("บันทึกแล้ว");}catch(e){setMessage(e instanceof Error?e.message:"บันทึกไม่สำเร็จ");}finally{setBusy(false);}}
 return <div className="sell-tool"><h1>กลุ่มซื้อขาย</h1><p>จัดรายชื่อกลุ่มและเลือกประเภทเกมที่เกี่ยวข้อง</p>{groups.map((g,i)=><section className="sell-section" key={i}><h2>กลุ่มที่ {i+1}</h2><label>ชื่อกลุ่ม<input value={g.name} onChange={e=>edit(i,{name:e.target.value})}/></label><label>ลิงก์กลุ่ม Facebook<input type="url" value={g.url} onChange={e=>edit(i,{url:e.target.value})}/></label><fieldset><legend>ประเภทเกม</legend><div className="sell-checks">{GAMES.map(game=><label key={game}><input type="checkbox" checked={g.games.includes(game)} onChange={e=>edit(i,{games:e.target.checked?[...g.games,game]:g.games.filter(x=>x!==game)})}/>{game}</label>)}</div></fieldset><label>กติกากลุ่ม (ถ้ามี)<textarea value={g.rules || ""} onChange={e=>edit(i,{rules:e.target.value})}/></label><button type="button" onClick={()=>setGroups(groups.filter((_,n)=>n!==i))}>นำออก</button></section>)}<div className="sell-actions"><button type="button" onClick={()=>setGroups([...groups,{name:"",url:"",games:[]}])}>เพิ่มกลุ่ม</button><button className="primary-action" type="button" disabled={busy||readOnly} onClick={save}>บันทึกรายชื่อ</button></div><p role="status">{message}</p></div>;
}
