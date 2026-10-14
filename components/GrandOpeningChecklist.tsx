"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, Minus, Download, RefreshCw } from "lucide-react";
import { emptyOpening, filterOpeningItems, mergeOpeningItems, newOpening, openingCategories, openingDays, openingProgress, openingSchema, stampOpening, type OpeningFields, type OpeningHistory, type OpeningItem } from "../lib/grand-opening-checklist.ts";

type Draft = { fields: OpeningFields; revision: number };
const labels: Record<keyof OpeningFields, string> = { title: "รายการ", category: "หมวด", day: "วัน", qtyNeeded: "ต้องใช้", qtyHave: "มีแล้ว", assignee: "ผู้รับผิดชอบ", note: "หมายเหตุ" };
const fieldsOf = (row: OpeningItem): OpeningFields => ({ title: row.title, category: row.category, day: row.day, qtyNeeded: row.qtyNeeded, qtyHave: row.qtyHave, assignee: row.assignee, note: row.note });
const time = (at: string | null) => at ? new Date(at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "";
export function GrandOpeningChecklist({ readOnly, userKey, userName }: { readOnly: boolean; userKey: string; userName: string }) {
  const key = `sop-grand-opening-v1:${userKey}`;
  const [rows, setRows] = useState<OpeningItem[]>([]);
  const [localRows, setLocalRows] = useState<OpeningItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [history, setHistory] = useState<Record<string, OpeningHistory[]>>({});
  const [localHistory, setLocalHistory] = useState<Record<string, OpeningHistory[]>>({});
  const [openHistory, setOpenHistory] = useState("");
  const restoredScroll = useRef(false);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState("loading");
  const [sync, setSync] = useState("");
  const [status, setStatus] = useState("");
  const [day, setDay] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState("");
  const [invalid, setInvalid] = useState("");
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem(key) || "null"); if (saved) { setDrafts(saved.drafts || {}); setLocalRows(saved.rows || []); setLocalHistory(saved.history || {}); setStatus(saved.status || ""); setDay(saved.day || ""); } }
    catch { setError("อ่านร่างในเครื่องไม่ได้ กรุณาส่งออกก่อนรีเซ็ต"); }
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(key, JSON.stringify({ drafts, rows: localRows, history: localHistory, status, day })); }
    catch { setError("เก็บร่างไม่ได้ อย่าปิดหน้านี้ก่อนบันทึกหรือส่งออก"); }
  }, [ready, key, drafts, localRows, localHistory, status, day]);
  async function load() {
    try {
      const res = await fetch("/api/grand-opening-checklist", { cache: "no-store" });
      if (!res.ok || !res.headers.get("content-type")?.includes("application/json")) throw new Error("โหลดไม่ได้ กรุณาเข้าสู่ระบบหรือลองใหม่");
      const data = await res.json(); setRows(data.rows); setMode(data.mode);
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { if (ready) void load(); }, [ready]);
  useEffect(() => {
    if (mode !== "shared") return;
    const stream = new EventSource("/api/grand-opening-checklist?stream=1");
    stream.addEventListener("rows", event => { const data = JSON.parse((event as MessageEvent).data); setRows(data.rows); setSync("อัปเดตสดจากทีม"); });
    const disconnected = () => setSync("กำลังเชื่อมต่อใหม่ ข้อมูลอาจยังไม่ล่าสุด");
    stream.onerror = disconnected;
    stream.addEventListener("unavailable", disconnected);
    return () => stream.close();
  }, [mode]);
  useEffect(() => {
    if (!ready || !["shared", "preview"].includes(mode)) return;
    const frame = requestAnimationFrame(() => {
      if (restoredScroll.current) return;
      restoredScroll.current = true;
      try { window.scrollTo(0, Number(localStorage.getItem(`${key}:scroll`) || 0)); } catch { /* Draft storage errors are reported separately. */ }
    });
    const remember = () => { try { localStorage.setItem(`${key}:scroll`, String(window.scrollY)); } catch { /* No storage in restricted browsers. */ } };
    window.addEventListener("scroll", remember, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", remember); };
  }, [ready, mode, key]);
  const savedRows = mode === "preview" ? mergeOpeningItems(localRows) : rows;
  const all = [...savedRows, ...Object.entries(drafts).filter(([id]) => !savedRows.some(row => row.id === id)).map(([id, draft]) => newOpening(id, draft.fields, userName, null))];
  const progress = openingProgress(savedRows);
  const visible = filterOpeningItems(all, status, day);
  const disabled = readOnly || !!saving || !["shared", "preview"].includes(mode);
  function change(row: OpeningItem, field: keyof OpeningFields, value: string | number | null) {
    setDrafts(previous => ({ ...previous, [row.id]: { fields: { ...(previous[row.id]?.fields || fieldsOf(row)), [field]: value }, revision: previous[row.id]?.revision ?? row.revision } }));
  }
  function reset(id: string) {
    if (!window.confirm("รีเซ็ตร่างรายการนี้กลับเป็นข้อมูลล่าสุด?")) return;
    setDrafts(previous => { const next = { ...previous }; delete next[id]; return next; });
  }
  async function mutate(row: OpeningItem, action: "save" | "tick" | "delete") {
    const draft = drafts[row.id];
    if (action === "save") {
      const parsed = openingSchema.safeParse(draft?.fields);
      if (!parsed.success) { const field = String(parsed.error.issues[0].path[0]); setInvalid(`${row.id}-${field}`); setError(`${labels[field as keyof OpeningFields]}: ${parsed.error.issues[0].message}`); document.getElementById(`${row.id}-${field}`)?.focus(); return; }
    }
    if (action === "delete" && !window.confirm(`ลบ “${row.title}” ออกจากเช็กลิสต์? ประวัติยังเก็บไว้`)) return;
    setSaving(row.id); setError(""); setInvalid("");
    try {
      let next: OpeningItem;
      if (mode === "preview") {
        const at = new Date().toISOString();
        next = action === "save" ? { ...row, ...openingSchema.parse(draft.fields) } : action === "tick" ? stampOpening(row, !row.done, userName, at) : { ...row, deleted: true };
        next = { ...next, revision: row.revision + 1, updatedBy: userName, updatedAt: at, createdAt: row.createdAt || at };
        setLocalRows(previous => [...previous.filter(item => item.id !== row.id), next]);
        setLocalHistory(previous => ({ ...previous, [row.id]: [{ id: crypto.randomUUID(), at, by: userName, action, before: savedRows.find(item => item.id === row.id) || null, after: next }, ...(previous[row.id] || [])] }));
      } else {
        const res = await fetch("/api/grand-opening-checklist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, revision: action === "save" ? draft.revision : row.revision, action, ...(action === "save" ? { fields: draft.fields } : action === "tick" ? { done: !row.done } : {}) }) });
        const data = await res.json(); if (!res.ok) { if (res.status === 409) await load(); throw new Error(data.detail || data.error || "บันทึกไม่สำเร็จ"); }
        next = data.row; setRows(previous => [...previous.filter(item => item.id !== row.id), next]);
      }
      if (action !== "tick") setDrafts(previous => { const nextDrafts = { ...previous }; delete nextDrafts[row.id]; return nextDrafts; });
      setOpenHistory(""); setMessage(mode === "preview" ? "บันทึกเฉพาะเครื่องนี้แล้ว" : "บันทึกให้ทีมแล้ว");
    } catch (e) { setError((e as Error).message); } finally { setSaving(""); }
  }
  async function showHistory(id: string) {
    if (openHistory === id) { setOpenHistory(""); return; }
    setOpenHistory(id);
    if (mode === "preview") { setHistory(previous => ({ ...previous, [id]: localHistory[id] || [] })); return; }
    try { const res = await fetch(`/api/grand-opening-checklist?id=${encodeURIComponent(id)}`, { cache: "no-store" }); if (!res.ok) throw new Error(); const data = await res.json(); setHistory(previous => ({ ...previous, [id]: data.history })); }
    catch { setError("โหลดประวัติไม่ได้ กรุณาลองใหม่"); }
  }
  function exportData() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ rows: all, drafts, history: mode === "preview" ? localHistory : history }, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "grand-opening-checklist.json"; a.click(); URL.revokeObjectURL(url);
    setMessage("ส่งออกแล้ว ประวัติทีมมีเฉพาะรายการที่เปิดดู");
  }
  return <div className="influencer-tracker go-checklist">
    <div className="go-toolbar"><button className="it-primary" disabled={disabled} onClick={() => { const id = crypto.randomUUID(); setStatus(""); setDay(""); setDrafts(previous => ({ ...previous, [id]: { fields: emptyOpening, revision: 0 } })); requestAnimationFrame(() => document.getElementById(`${id}-title`)?.focus()); }}><Plus size={18} aria-hidden="true" />เพิ่มรายการ</button><button className="it-secondary" onClick={() => void load()}><RefreshCw size={16} aria-hidden="true" />โหลดล่าสุด</button><button className="it-secondary" onClick={exportData}><Download size={16} aria-hidden="true" />ส่งออก</button></div>
    <p className="it-notice">{mode === "preview" ? "ทดลองในเครื่องนี้เท่านั้น ยังไม่ใช่ข้อมูลร่วมของทีม" : mode === "shared" ? sync || "กำลังเชื่อมต่อข้อมูลสด" : "กำลังโหลดข้อมูล"}{readOnly ? " · ดูแทนพนักงาน: อ่านอย่างเดียว" : ""}</p>
    <p role="status">{message}</p>{error && <p role="alert">{error}</p>}
    <section className="go-progress" aria-label="ความคืบหน้า"><strong>พร้อมแล้ว {progress.overall.done} / {progress.overall.total} รายการ</strong><progress value={progress.overall.done} max={progress.overall.total || 1} aria-label="ความคืบหน้ารวม" /><div>{progress.categories.map(category => <span key={category.category}>{category.category} <b>{category.done}/{category.total}</b></span>)}</div></section>
    <div className="go-filters"><label>สถานะ<select value={status} onChange={e => setStatus(e.target.value)}><option value="">ทั้งหมด</option><option value="pending">ค้าง</option><option value="done">เสร็จ</option></select></label><label>วันใช้งาน<select value={day} onChange={e => setDay(e.target.value)}><option value="">ทุกวัน</option>{openingDays.map(value => <option key={value} value={value}>{value === "ทั้งสองวัน" ? value : `${value} ต.ค.`}</option>)}</select></label></div>
    <details className="go-help"><summary>วิธีใช้เช็กลิสต์</summary><p>แก้รายการแล้วกดบันทึก ร่างจะเก็บในเครื่องอัตโนมัติ กดรีเซ็ตเพื่อทิ้งร่าง การติ๊กเสร็จพร้อมชื่อและเวลา ต้องบันทึกหรือรีเซ็ตร่างก่อนติ๊ก รายการทั้งสองวันจะแสดงในตัวกรอง 17 และ 18 ต.ค.</p></details>
    {openingCategories.map(category => <section key={category} className="go-category"><h3>{category}</h3>{visible.filter(row => row.category === category).map(row => {
      const fields = drafts[row.id]?.fields || fieldsOf(row);
      const saved = savedRows.some(item => item.id === row.id);
      return <article className="go-item" key={row.id}>
        <div className="go-item-head"><label className="go-tick"><input type="checkbox" checked={row.done} disabled={disabled || !saved || !!drafts[row.id]} onChange={() => void mutate(row, "tick")} aria-label={`เสร็จ: ${row.title}`} /><span title={fields.title}>{fields.title || "รายการใหม่"}</span></label><span>{row.day ? `${row.day}${row.day === "ทั้งสองวัน" ? "" : " ต.ค."}` : "ไม่ระบุวัน"}</span></div>
        {row.done && <p className="go-meta">ติ๊กโดย {row.doneBy} · {time(row.doneAt)}</p>}
        <p className="go-meta">{row.assignee ? `ผู้รับผิดชอบ: ${row.assignee}` : "ยังไม่มอบหมาย"}{row.qtyNeeded !== null || row.qtyHave !== null ? ` · มี ${row.qtyHave ?? "ยังไม่ระบุ"} / ต้องใช้ ${row.qtyNeeded ?? "ยังไม่ระบุ"}` : ""}</p>
        {row.note && <p className="go-note">{row.note}</p>}
        <details open={!!drafts[row.id]}><summary>แก้รายละเอียด{drafts[row.id] ? " · มีร่างที่ยังไม่บันทึก" : ""}</summary><div className="go-editor">
          {(["title", "category", "day", "assignee", "note", "qtyNeeded", "qtyHave"] as const).map(field => <label key={field} htmlFor={`${row.id}-${field}`}>{labels[field]}{field === "category" || field === "day" ? <select id={`${row.id}-${field}`} name={field} autoComplete="off" value={fields[field]} disabled={disabled} onChange={e => change(row, field, e.target.value)}>{(field === "category" ? openingCategories : ["", ...openingDays]).map(value => <option key={value} value={value}>{value || "ไม่ระบุ"}</option>)}</select> : field === "note" ? <textarea id={`${row.id}-${field}`} name={field} autoComplete="off" value={fields[field]} rows={2} maxLength={5000} disabled={disabled} onChange={e => change(row, field, e.target.value)} /> : field === "qtyNeeded" || field === "qtyHave" ? <div className="go-quantity"><button type="button" aria-label={`ลด${labels[field]} ${fields.title}`} disabled={disabled || fields[field] === null || fields[field] === 0} onClick={() => change(row, field, Math.max(0, (fields[field] || 0) - 1))}><Minus size={16} aria-hidden="true" /></button><input id={`${row.id}-${field}`} name={field} autoComplete="off" type="number" min="0" max="1000000" step="any" value={fields[field] ?? ""} aria-invalid={invalid === `${row.id}-${field}`} disabled={disabled} onChange={e => change(row, field, e.target.value === "" ? null : Number(e.target.value))} /><button type="button" aria-label={`เพิ่ม${labels[field]} ${fields.title}`} disabled={disabled || (fields[field] ?? 0) >= 1000000} onClick={() => change(row, field, (fields[field] || 0) + 1)}><Plus size={16} aria-hidden="true" /></button></div> : <input id={`${row.id}-${field}`} name={field} autoComplete="off" value={fields[field]} maxLength={field === "title" ? 200 : 150} aria-invalid={invalid === `${row.id}-${field}`} disabled={disabled} onChange={e => change(row, field, e.target.value)} />}</label>)}
        </div><div className="go-toolbar"><button className="it-primary" disabled={disabled || !drafts[row.id]} onClick={() => void mutate(row, "save")}>{saving === row.id ? "กำลังบันทึก" : "บันทึก"}</button><button className="it-secondary" disabled={disabled || !drafts[row.id]} onClick={() => reset(row.id)}>รีเซ็ตร่าง</button><button className="it-secondary" disabled={disabled} onClick={() => saved ? void mutate(row, "delete") : reset(row.id)}>ลบรายการ</button></div></details>
        <p className="go-meta">สร้าง: {row.createdBy} {time(row.createdAt)}{row.updatedAt ? ` · แก้ล่าสุด: ${row.updatedBy} ${time(row.updatedAt)}` : ""}</p>
        <button className="go-history-button" onClick={() => void showHistory(row.id)}>{openHistory === row.id ? "ปิดประวัติ" : "ประวัติการแก้ไข"}</button>
        {openHistory === row.id && <div className="go-history">{!history[row.id]?.length && <p>ยังไม่มีประวัติที่บันทึก</p>}{history[row.id]?.map(event => <details key={event.id}><summary>{event.by} · {time(event.at)} · {event.action === "tick" ? event.after.done ? "ติ๊กเสร็จ" : "ยกเลิกเสร็จ" : event.action === "delete" ? "ลบ" : "บันทึก"}</summary><ul>{Object.keys(labels).filter(field => event.before?.[field as keyof OpeningFields] !== event.after[field as keyof OpeningFields]).map(field => <li key={field}>{labels[field as keyof OpeningFields]}: {String(event.before?.[field as keyof OpeningFields] ?? "ไม่ระบุ")} → {String(event.after[field as keyof OpeningFields] ?? "ไม่ระบุ")}</li>)}</ul></details>)}</div>}
      </article>;
    })}{!visible.some(row => row.category === category) && <p>ไม่มีรายการในตัวกรองนี้</p>}</section>)}
    {!rows.length && mode === "loading" && <p>หากโหลดไม่สำเร็จ กดโหลดล่าสุดเพื่อลองใหม่</p>}
  </div>;
}
