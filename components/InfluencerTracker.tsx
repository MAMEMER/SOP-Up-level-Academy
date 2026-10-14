"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Download, Plus, RefreshCw } from "lucide-react";
import { emptyInfluencer, influencerPlatforms, influencerSchema, influencerStatuses, matchesInfluencer, mergeInfluencers, openingMessage, type Influencer, type InfluencerFields, type InfluencerHistory } from "../lib/influencers.ts";

type Draft = { fields: InfluencerFields; revision: number };
const labels: Record<keyof InfluencerFields, string> = { name: "ชื่อช่อง", platform: "แพลตฟอร์ม", links: "ลิงก์", followers: "ผู้ติดตาม", content: "สายคอนเทนต์", status: "สถานะ", rate: "เรท (บาท)", contactedBy: "ผู้ทัก", lastContact: "วันที่ทักล่าสุด (เวลาไทย)", note: "โน้ต" };
const fieldsOf = ({ id: _id, revision: _revision, ...fields }: Influencer) => fields;
export function InfluencerTracker({ readOnly, userKey }: { readOnly: boolean; userKey: string }) {
  const key = `sop-influencers-v1:${userKey}`;
  const [rows, setRows] = useState<Influencer[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [mode, setMode] = useState("loading");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");
  const [invalid, setInvalid] = useState("");
  const [status, setStatus] = useState("");
  const [platform, setPlatform] = useState("");
  const [search, setSearch] = useState("");
  const [ready, setReady] = useState(false);
  const restoredScroll = useRef(false);
  const [history, setHistory] = useState<Record<string, InfluencerHistory[]>>({});
  const [openHistory, setOpenHistory] = useState("");
  const [localRows, setLocalRows] = useState<Influencer[]>([]);
  const [localHistory, setLocalHistory] = useState<Record<string, InfluencerHistory[]>>({});
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      if (saved) { setDrafts(saved.drafts || {}); setLocalRows(saved.rows || []); setLocalHistory(saved.history || {}); setStatus(saved.status || ""); setPlatform(saved.platform || ""); setSearch(saved.search || ""); }
    } catch { setError("อ่านร่างในเครื่องไม่ได้ กรุณาส่งออกข้อมูลก่อนรีเซ็ตร่าง"); }
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(key, JSON.stringify({ drafts, rows: localRows, history: localHistory, status, platform, search })); }
    catch { setError("เก็บร่างในเครื่องไม่ได้ อย่าปิดหน้านี้ก่อนบันทึกหรือส่งออก"); }
  }, [drafts, localRows, localHistory, status, platform, search, ready, key]);
  async function load() {
    setError("");
    try {
      const res = await fetch("/api/influencers", { cache: "no-store" });
      if (!res.ok || !res.headers.get("content-type")?.includes("application/json")) throw new Error("โหลดไม่ได้ กรุณาเข้าสู่ระบบหรือลองใหม่");
      const data = await res.json(); setMode(data.mode); setRows(data.rows);
    } catch (e) { setError((e as Error).message); setMode("error"); }
  }
  useEffect(() => { if (ready) void load(); }, [ready]);
  useEffect(() => {
    if (!ready || !["preview", "shared"].includes(mode)) return;
    const frame = requestAnimationFrame(() => {
      if (restoredScroll.current) return;
      restoredScroll.current = true;
      try { window.scrollTo(0, Number(localStorage.getItem(`${key}:scroll`) || 0)); } catch { /* Storage may be unavailable. */ }
    });
    const remember = () => { try { localStorage.setItem(`${key}:scroll`, String(window.scrollY)); } catch { /* Draft error is reported separately. */ } };
    window.addEventListener("scroll", remember, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", remember); };
  }, [ready, mode, key]);
  const displayRows = mode === "preview" ? mergeInfluencers(localRows) : rows;
  const allRows = [...displayRows, ...Object.entries(drafts).filter(([id]) => !displayRows.some(row => row.id === id)).map(([id, draft]) => ({ ...draft.fields, id, revision: draft.revision }))];
  const visible = allRows.filter(row => matchesInfluencer(row, status, platform, search));
  function change(row: Influencer, field: keyof InfluencerFields, value: string) {
    setDrafts(previous => ({ ...previous, [row.id]: { fields: { ...(previous[row.id]?.fields || fieldsOf(row)), [field]: value }, revision: previous[row.id]?.revision ?? row.revision } }));
  }
  function reset(id: string) {
    if (!window.confirm("รีเซ็ตร่างช่องนี้กลับเป็นข้อมูลที่บันทึกล่าสุด? ประวัติที่บันทึกแล้วจะยังอยู่")) return;
    setDrafts(previous => { const next = { ...previous }; delete next[id]; return next; });
  }
  async function save(row: Influencer) {
    const draft = drafts[row.id]; if (!draft) return;
    const parsed = influencerSchema.safeParse(draft.fields);
    if (!parsed.success) { setInvalid(`${row.id}-${String(parsed.error.issues[0].path[0])}`); setError(`${labels[parsed.error.issues[0].path[0] as keyof InfluencerFields]}: ${parsed.error.issues[0].message}`); document.getElementById(`${row.id}-${String(parsed.error.issues[0].path[0])}`)?.focus(); return; }
    setSaving(row.id); setError(""); setInvalid("");
    try {
      if (mode === "preview") {
        const saved = { ...parsed.data, id: row.id, revision: draft.revision + 1 };
        setLocalRows(previous => [...previous.filter(item => item.id !== row.id), saved]);
        setLocalHistory(previous => ({ ...previous, [row.id]: [{ id: crypto.randomUUID(), at: new Date().toISOString(), by: "ทดลองในเครื่อง", before: displayRows.some(item => item.id === row.id) ? fieldsOf(row) : null, after: parsed.data }, ...(previous[row.id] || [])] }));
      } else {
        const res = await fetch("/api/influencers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, revision: draft.revision, fields: parsed.data }) });
        const data = await res.json(); if (!res.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
        setRows(previous => [...previous.filter(item => item.id !== row.id), data.row]);
      }
      setDrafts(previous => { const next = { ...previous }; delete next[row.id]; return next; });
      setOpenHistory(""); setMessage(mode === "preview" ? "บันทึกในเครื่องนี้แล้ว ยังไม่ใช่ข้อมูลร่วมของทีม" : "บันทึกให้ทีมแล้ว พร้อมเก็บประวัติ");
    } catch (e) { setError((e as Error).message); } finally { setSaving(""); }
  }
  async function showHistory(id: string) {
    if (openHistory === id) { setOpenHistory(""); return; }
    setOpenHistory(id);
    if (mode === "preview") { setHistory(previous => ({ ...previous, [id]: localHistory[id] || [] })); return; }
    try {
      const res = await fetch(`/api/influencers?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!res.ok) throw new Error("โหลดประวัติไม่ได้");
      const data = await res.json(); setHistory(previous => ({ ...previous, [id]: data.history }));
    } catch { setError("โหลดประวัติไม่ได้ กรุณาลองใหม่"); setOpenHistory(""); }
  }
  function exportData() {
    const blob = new Blob([JSON.stringify({ rows: allRows, drafts, history: mode === "preview" ? localHistory : history }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "influencer-tracker.json"; anchor.click(); URL.revokeObjectURL(url);
    setMessage("ส่งออกรายการและร่างแล้ว ประวัติทีมในไฟล์มีเฉพาะช่องที่เปิดดูในหน้านี้");
  }
  return <div className="influencer-tracker">
    <section className="it-guide" aria-label="วิธีทักอินฟลูเอนเซอร์">
      <h3>เริ่มจากรู้จักกัน แล้วค่อยชวนมางาน</h3>
      <p>ทักในนามแอดมินร้าน · ข้อความแรกทักทายอย่างเดียว · แชทสั้น 1–2 บรรทัด</p>
      <blockquote>{openingMessage}</blockquote>
      <button type="button" className="it-secondary" onClick={async () => { try { await navigator.clipboard.writeText(openingMessage); setMessage("คัดลอกข้อความทักทายแล้ว"); } catch { setError("คัดลอกไม่ได้ กรุณาเลือกข้อความแล้วคัดลอกเอง"); } }}><Copy aria-hidden="true" size={16} /> คัดลอกคำทัก</button>
      <p>คุย 5–10 ข้อความก่อนพูดเรื่องงาน GO วันที่ 17–18 ต.ค. ที่เสนาเฟสท์ แล้วค่อยบอกว่ามีงานเรื่อยๆ เปิดเป็นพันธมิตร งบหลักร้อย–พัน</p>
    </section>
    <div className="it-toolbar">
      <button type="button" className="it-primary" disabled={readOnly || !["shared", "preview"].includes(mode)} onClick={() => { const id = crypto.randomUUID(); setDrafts(previous => ({ ...previous, [id]: { fields: { ...emptyInfluencer }, revision: 0 } })); setStatus(""); setPlatform(""); setSearch(""); setTimeout(() => document.getElementById(`${id}-name`)?.focus(), 0); }}><Plus aria-hidden="true" size={18} /> เพิ่มช่อง</button>
      <button type="button" className="it-secondary" onClick={load}><RefreshCw aria-hidden="true" size={16} /> โหลดล่าสุด</button>
      <button type="button" className="it-secondary" onClick={exportData}><Download aria-hidden="true" size={16} /> ส่งออก</button>
      <span>{displayRows.length} ช่อง · ยังไม่ทัก {displayRows.filter(row => row.status === "ยังไม่ทัก").length}</span>
    </div>
    {mode === "preview" && <p className="it-notice">โหมดทดลอง: บันทึกเฉพาะเบราว์เซอร์นี้ ยังไม่แชร์กับทีม ข้อมูลจริงต้องเชื่อมระบบบนเซิร์ฟเวอร์</p>}
    {readOnly && <p>กำลังดูแทนพนักงาน จึงแก้ข้อมูลไม่ได้</p>}
    <p role="status">{message || (mode === "loading" ? "กำลังโหลด…" : "ร่างเก็บอัตโนมัติในเครื่อง กดบันทึกแต่ละช่องเพื่อยืนยัน")}</p>
    {error && <p id="it-error" role="alert" className="it-notice">{error}</p>}
    <div className="it-filters">
      <label>ค้นหาช่อง<input value={search} onChange={event => setSearch(event.target.value)} placeholder="ชื่อช่อง / โน้ต / ผู้ทัก" /></label>
      <label>สถานะ<select value={status} onChange={event => setStatus(event.target.value)}><option value="">ทุกสถานะ</option>{influencerStatuses.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>แพลตฟอร์ม<select value={platform} onChange={event => setPlatform(event.target.value)}><option value="">ทุกแพลตฟอร์ม</option>{["FB", "IG", "TikTok"].map(value => <option key={value}>{value}</option>)}</select></label>
    </div>
    <details className="it-help"><summary>วิธีใช้และประวัติ</summary><p>แก้ช่องในรายการได้ทันที แล้วกดบันทึก ร่างจะอยู่แม้รีเฟรช · รีเซ็ตร่างไม่ลบข้อมูลที่บันทึกแล้ว · ประวัติเก็บข้อมูลก่อนและหลังแก้ พร้อมผู้บันทึกและเวลา · วันที่ทักกรอกตามเวลาไทย · ช่อง FB+TikTok จะแสดงในตัวกรองทั้งสองแพลตฟอร์ม</p></details>
    <p>แสดง {visible.length} ช่อง</p>
    <div className="it-table" role="table" aria-label="ติดตามอินฟลูเอนเซอร์">
      <div className="it-head" role="row">{["ช่อง / แพลตฟอร์ม / ลิงก์", "ผู้ติดตาม / สายคอนเทนต์", "สถานะ / เรท", "ผู้ทัก / วันที่ทัก", "โน้ต / ประวัติ"].map(title => <span key={title} role="columnheader">{title}</span>)}</div>
      {visible.map(row => {
        const fields = drafts[row.id]?.fields || fieldsOf(row);
        const control = (field: keyof InfluencerFields) => <label htmlFor={`${row.id}-${field}`}>{labels[field]}{field === "platform" || field === "status" ? <select id={`${row.id}-${field}`} name={field} autoComplete="off" aria-invalid={invalid === `${row.id}-${field}`} aria-describedby={invalid === `${row.id}-${field}` ? "it-error" : undefined} disabled={readOnly || !!saving} value={fields[field]} onChange={event => change(row, field, event.target.value)}>{(field === "status" ? influencerStatuses : influencerPlatforms).map(value => <option key={value}>{value}</option>)}</select> : field === "note" || field === "links" || field === "rate" ? <textarea id={`${row.id}-${field}`} name={field} autoComplete="off" aria-invalid={invalid === `${row.id}-${field}`} aria-describedby={invalid === `${row.id}-${field}` ? "it-error" : undefined} rows={field === "note" ? 3 : 2} maxLength={field === "note" ? 5000 : field === "links" ? 1500 : 500} disabled={readOnly || !!saving} value={fields[field]} onChange={event => change(row, field, event.target.value)} /> : <input id={`${row.id}-${field}`} name={field} autoComplete="off" aria-invalid={invalid === `${row.id}-${field}`} aria-describedby={invalid === `${row.id}-${field}` ? "it-error" : undefined} type={field === "lastContact" ? "datetime-local" : "text"} maxLength={150} disabled={readOnly || !!saving} value={fields[field]} onChange={event => change(row, field, event.target.value)} />}</label>;
        return <div key={row.id} className="it-row" role="row">
          <div role="cell">{control("name")}{control("platform")}<details><summary>ลิงก์ช่อง / แก้ลิงก์</summary>{fields.links.split(/[\s,]+/).filter(link => /^https?:\/\//.test(link)).map((link, index) => <a key={`${link}-${index}`} href={link} target="_blank" rel="noreferrer">เปิดช่อง {index + 1}</a>)}{control("links")}</details></div>
          <div role="cell">{control("followers")}{control("content")}</div>
          <div role="cell">{control("status")}{control("rate")}</div>
          <div role="cell">{control("contactedBy")}{control("lastContact")}</div>
          <div role="cell">{control("note")}{drafts[row.id] && drafts[row.id].revision !== row.revision && <button type="button" className="it-secondary" onClick={() => { if (window.confirm("ตรวจข้อมูลล่าสุดแล้ว และต้องการใช้ร่างนี้แทน? ข้อมูลเดิมยังอยู่ในประวัติ")) setDrafts(previous => ({ ...previous, [row.id]: { ...previous[row.id], revision: row.revision } })); }}>ยืนยันร่างเทียบล่าสุด</button>}<div className="it-actions"><button type="button" className="it-primary" disabled={readOnly || !drafts[row.id] || !!saving} onClick={() => save(row)}>{saving === row.id ? "กำลังบันทึก…" : "บันทึก"}</button><button type="button" className="it-secondary" disabled={!drafts[row.id] || !!saving} onClick={() => reset(row.id)}>รีเซ็ตร่าง</button><button type="button" className="it-secondary" onClick={() => showHistory(row.id)} aria-expanded={openHistory === row.id}>ประวัติ</button></div></div>
          {openHistory === row.id && <section className="it-history" aria-label={`ประวัติ ${row.name}`}><h4>ประวัติ {row.name} (ล่าสุดไม่เกิน 100 รายการ)</h4>{!history[row.id] ? <p>กำลังโหลด…</p> : history[row.id].length === 0 ? <p>ยังไม่มีการแก้ไขที่บันทึก</p> : history[row.id].map(event => <details key={event.id}><summary>{new Date(event.at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })} · {event.by}</summary>{Object.keys(labels).filter(field => !event.before || event.before[field as keyof InfluencerFields] !== event.after[field as keyof InfluencerFields]).map(field => <p key={field}><strong>{labels[field as keyof InfluencerFields]}</strong><br />ก่อน: {event.before?.[field as keyof InfluencerFields] || "ไม่ได้ระบุ"}<br />หลัง: {event.after[field as keyof InfluencerFields] || "ไม่ได้ระบุ"}</p>)}</details>)}</section>}
        </div>;
      })}
    </div>
    {!visible.length && mode !== "loading" && <p>ไม่พบช่องที่ตรงกับตัวกรอง</p>}
  </div>;
}
