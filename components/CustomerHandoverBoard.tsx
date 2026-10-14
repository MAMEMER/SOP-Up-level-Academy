"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, PackageCheck, History, RotateCcw, ArrowLeft, Download, ShieldCheck } from "lucide-react";
import type { Balance, HandoverLine } from "../lib/customer-handover.ts";
type Line = HandoverLine & { balance: Balance | null; ready: boolean; openingPending: boolean };
type Data = { lines: Line[]; missing: string[]; loadedAt: string; phone: string };
export function CustomerHandoverBoard({ account, grant, unavailable }: { account: string; grant: { permissions: string[]; branches: string[] }; unavailable: string }) {
  const [phone, setPhone] = useState(""); const [branch, setBranch] = useState(grant.branches[0] || "bangkae");
  const [data, setData] = useState<Data | null>(null); const [selected, setSelected] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [review, setReview] = useState(false);
  const [recipient, setRecipient] = useState("self"); const [recipientName, setRecipientName] = useState(""); const [verification, setVerification] = useState("");
  const [receipt, setReceipt] = useState(""); const [events, setEvents] = useState<any[]>([]); const [pending, setPending] = useState<any[] | null>(null);
  const [requestId, setRequestId] = useState(""); const [correction, setCorrection] = useState<{ type: string; event: any; line: any } | null>(null);
  const [reason, setReason] = useState(""); const [quantity, setQuantity] = useState(1); const [disposition, setDisposition] = useState("replace");
  const draftKey = `customer-handover:${account}:${phone.replace(/\D/g, "")}:${branch}`;
  const chosen = data?.lines.filter(line => selected[line.key] > 0) ?? [];
  const total = chosen.reduce((sum, line) => sum + selected[line.key], 0);
  const canRecord = !unavailable && grant.permissions.includes("record");
  async function api(url: string, init?: RequestInit) { const result = await fetch(url, { ...init, cache: "no-store" }); const body = await result.json(); if (!result.ok) throw new Error(body.error || "ดำเนินการไม่สำเร็จ"); return body; }
  useEffect(() => { setData(null); setSelected({}); setReview(false); setReceipt(""); setEvents([]); setCorrection(null); }, [phone, branch]);
  useEffect(() => {
    if (!data) return;
    try { localStorage.setItem(draftKey, JSON.stringify({ selected, requestId, receipt })); } catch { setError("บันทึกร่างบนเครื่องไม่ได้ โปรดอย่าปิดหน้าระหว่างทำรายการ"); }
  }, [selected, requestId, receipt, data, draftKey]);
  async function search() {
    setBusy(true); setError(""); setReview(false);
    try {
      const next = await api(`/api/customer-handover?phone=${encodeURIComponent(phone)}`);
      let draft: any = {}; try { draft = JSON.parse(localStorage.getItem(draftKey) || "{}"); } catch { /* invalid local draft is ignored */ }
      const restored: Record<string, number> = {};
      for (const line of next.lines) { const n = draft.selected?.[line.key]; if (line.ready && Number.isInteger(n) && n > 0 && n <= line.balance.entitlement - line.balance.delivered - line.balance.cancelled - line.balance.inTransit) restored[line.key] = n; }
      setSelected(draft.receipt ? {} : restored); setReceipt(draft.receipt || ""); setRequestId(draft.requestId || crypto.randomUUID()); setData(next);
    } catch (e) { setError(String((e as Error).message)); } finally { setBusy(false); }
  }
  function reset() { localStorage.removeItem(draftKey); setSelected({}); setReview(false); setVerification(""); setRecipientName(""); setReceipt(""); setRequestId(crypto.randomUUID()); setCorrection(null); }
  async function save() {
    if (!data) return;
    setBusy(true); setError("");
    try {
      const body = { requestId, type: "handover", phone, branch, lines: chosen.map(line => ({ key: line.key, quantity: selected[line.key], fingerprint: line.fingerprint })), recipient: { type: recipient, name: recipientName, verification } };
      const result = await api("/api/customer-handover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setReceipt(result.eventId); setReview(false); setSelected({}); setData(await api(`/api/customer-handover?phone=${encodeURIComponent(phone)}`));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function showHistory() { setBusy(true); setError(""); try { const result = await api(`/api/customer-handover?action=history&branch=${branch}&phone=${encodeURIComponent(phone)}`); setEvents(result.events); if (result.truncated) setError("ประวัติเกิน 500 ใบ โปรดใช้รายงานผู้ดูแลเพิ่มเติม"); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function showPending() { setBusy(true); setError(""); try { const result = await api("/api/customer-handover?action=opening"); setPending(result.lines); if (result.missing.length) setError(`ข้อมูลที่ขาด: ${result.missing.join(", ")}`); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  function exportData(rows: any[], filename: string) { const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }
  async function saveCorrection() {
    if (!correction) return;
    const current = data?.lines.find(line => line.key === correction.line.key);
    if (!current) { setError("ค้นเบอร์ของใบรับนี้และโหลดข้อมูลล่าสุดก่อนแก้รายการ"); return; }
    setBusy(true); setError("");
    try {
      const result = await api("/api/customer-handover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId, phone, branch, type: correction.type, reason, returnDisposition: disposition, lines: [{ key: current.key, quantity, fingerprint: current.fingerprint, referenceEventId: correction.event.eventId }] }) });
      setReceipt(result.eventId); setCorrection(null); setRequestId(crypto.randomUUID()); setData(await api(`/api/customer-handover?phone=${encodeURIComponent(phone)}`)); await showHistory();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <main className="handover-page">
    <Link href="/" className="handover-back"><ArrowLeft size={18} aria-hidden /> หน้าหลัก</Link>
    <header className="handover-heading"><p className="eyebrow">งานบริการลูกค้า</p><h1><PackageCheck size={30} aria-hidden /> ส่งมอบสินค้า</h1><p>เลือกสินค้าที่ลูกค้ารับจริง เก็บประวัติทุกครั้งโดยไม่แก้ข้อมูลเงิน</p></header>
    {unavailable && <p className="handover-notice" role="status"><ShieldCheck size={20} aria-hidden />{unavailable}</p>}
    <p className="handover-notice">ออเดอร์เก่าที่ยังไม่ยืนยันยอดตั้งต้นจะส่งมอบไม่ได้ ช่องว่างในประวัติเดิมไม่ได้แปลว่ายังไม่เคยรับ</p>
    <form className="handover-search" onSubmit={e => { e.preventDefault(); void search(); }}>
      <label>สาขา<select value={branch} onChange={e => setBranch(e.target.value)} disabled={!!unavailable}>{(grant.branches.length ? grant.branches : ["bangkae", "senafest"]).map(b => <option key={b} value={b}>{b === "bangkae" ? "บางแค" : "เสนาเฟสต์"}</option>)}</select></label>
      <label>เบอร์โทรลูกค้า<input type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0xx xxx xxxx" required aria-invalid={!!error} /></label>
      <button className="button" disabled={busy || !!unavailable}><Search size={18} aria-hidden />{busy ? "กำลังตรวจสอบ" : "ค้นหาสินค้า"}</button>
    </form>
    <div className="handover-tools"><button onClick={reset} type="button"><RotateCcw size={18} aria-hidden /> ล้างร่าง</button><button disabled={busy || !!unavailable} onClick={showHistory}><History size={18} aria-hidden /> ประวัติสาขา</button>{grant.permissions.includes("approveOpening") && <button disabled={busy} onClick={showPending}>ยอดตั้งต้นรอยืนยัน</button>}</div>
    {error && <p role="alert" className="handover-error">{error}</p>}
    {receipt && <section className="handover-receipt" aria-live="polite"><h2>บันทึกใบรับแล้ว</h2><p>เลขบันทึก <span>{receipt}</span></p><button onClick={() => navigator.clipboard.writeText(receipt)}>คัดลอกเลขใบรับ</button></section>}
    {data && <div className="handover-workspace"><section><h2>{review ? "ตรวจรายการก่อนส่งมอบ" : `ผลค้นหา ${data.phone}`}</h2><p>ตรวจล่าสุด {new Date(data.loadedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</p>{data.missing.length > 0 && <p role="alert">ข้อมูลที่ขาด: {data.missing.join(", ")} ปิดบันทึกชั่วคราว</p>}{!data.lines.length && <p>ไม่พบสินค้าจากแหล่งที่โหลดสำเร็จ ตรวจเบอร์และแหล่งข้อมูลที่ขาด</p>}
      {(review ? chosen : data.lines).map(line => <article key={line.key} className="handover-line"><details><summary>{line.productName}</summary><p>{line.productName}</p></details><p>{line.source} · {line.orderId}</p><p>ผู้ซื้อ {line.customerName}</p><p>สิทธิ์ตามต้นทาง {line.entitlement} {line.unit} · {line.paid ? "ชำระครบ" : "รอตรวจเงิน"}</p>
        {line.openingPending ? <p className="handover-warning">ยังไม่ยืนยันยอดตั้งต้น ไม่ระบุยอดค้างรับ</p> : <p>เคยรับ {line.balance?.delivered} · ค้าง {line.balance ? line.balance.entitlement - line.balance.delivered - line.balance.cancelled - line.balance.inTransit : 0} {line.unit}</p>}
        {line.shipped && <p>ส่งแล้วหรือเลือกจัดส่ง รอยืนยันรับ ห้ามรับหน้าร้านซ้ำ</p>}{line.blockers.map((b, i) => <p key={i} className="handover-warning">{b}</p>)}
        {!review ? <div className="handover-select"><label><input type="checkbox" disabled={!line.ready || !canRecord || !!receipt} checked={!!selected[line.key]} onChange={e => { setSelected(s => ({ ...s, [line.key]: e.target.checked ? 1 : 0 })); setRequestId(crypto.randomUUID()); }} />เลือกส่งมอบ</label><label>จำนวน<input type="number" min={1} max={line.balance ? line.balance.entitlement - line.balance.delivered - line.balance.cancelled - line.balance.inTransit : 0} disabled={!selected[line.key] || !!receipt} value={selected[line.key] || 1} onChange={e => { setSelected(s => ({ ...s, [line.key]: Number(e.target.value) })); setRequestId(crypto.randomUUID()); }} /></label></div> : <strong>ส่งมอบ {selected[line.key]} {line.unit}</strong>}
      </article>)}</section>
      <aside className="handover-summary"><h2>{review ? "ยืนยันผู้รับจริง" : "รายการที่เลือก"}</h2><p>{chosen.length} รายการ · {total} หน่วย</p>{review && <><label>ผู้รับ<select value={recipient} onChange={e => setRecipient(e.target.value)}><option value="self">ลูกค้ารับเอง</option><option value="representative">ผู้รับแทน</option></select></label>{recipient === "representative" && <label>ชื่อผู้รับแทน<input value={recipientName} onChange={e => setRecipientName(e.target.value)} maxLength={120} /></label>}<label>วิธียืนยันกับออเดอร์<textarea value={verification} onChange={e => setVerification(e.target.value)} maxLength={300} placeholder="เช่น ลูกค้าแสดงเลขออเดอร์และยืนยันสินค้าที่สั่ง" /></label><p>การรู้เบอร์โทรอย่างเดียวไม่ใช่หลักฐานรับแทน</p></>}
        <div className="handover-action">{review && <button disabled={busy} onClick={() => setReview(false)}>กลับไปเลือกรายการ</button>}<button className="button" disabled={!canRecord || busy || !total || !!receipt || (review && (verification.trim().length < 5 || (recipient === "representative" && !recipientName.trim())))} onClick={() => review ? void save() : setReview(true)}>{review ? "บันทึกส่งมอบ" : `ตรวจรายการ ${total} หน่วย`}</button></div>
      </aside></div>}
    <details className="handover-help"><summary>วิธีใช้งานและข้อควรระวัง</summary><p>ค้นเบอร์ เลือกสินค้าจริง ตรวจสาขาและผู้รับก่อนบันทึก ถ้ายอดไม่ตรงให้หยุดส่งของและแจ้งแชมป์ การคืนหรือกลับรายการเป็นประวัติใหม่ ไม่คืนเงินอัตโนมัติ ร่างเก็บเฉพาะเลขรายการและจำนวนแยกตามบัญชี เบอร์ และสาขา</p></details>
    {events.length > 0 && <section><h2>ประวัติสาขา</h2><button onClick={() => exportData(events, "handover-history.json")}><Download size={18} aria-hidden /> ส่งออกรายงาน (ปกปิดเบอร์)</button>{events.map(e => <article className="handover-line" key={e.eventId}><details><summary>{e.type} · {e.customerPhoneNormalized} · {e.recordedAt}</summary><p>{e.eventId}</p><p>ผู้บันทึก {e.actorNameSnapshot}</p>{e.lines.map((l: any) => <div key={l.key}><p>{l.productNameSnapshot} × {l.quantity}</p>{grant.permissions.includes("correct") && ["handover", "cancel_entitlement"].includes(e.type) && <div className="handover-tools">{e.type === "handover" && <button onClick={() => { setCorrection({ type: "return", event: e, line: l }); setRequestId(crypto.randomUUID()); }}>บันทึกคืน</button>}<button onClick={() => { setCorrection({ type: "reversal", event: e, line: l }); setRequestId(crypto.randomUUID()); }}>กลับรายการ</button></div>}</div>)}</details></article>)}</section>}
    {correction && <section><h2>{correction.type === "return" ? "บันทึกคืนสินค้า" : "กลับรายการ"}</h2><p>{correction.line.productNameSnapshot} อ้างใบ {correction.event.eventId}</p><label>จำนวน<input type="number" min={1} max={correction.line.quantity} value={quantity} onChange={e => setQuantity(Number(e.target.value))} /></label><label>เหตุผล<textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={500} /></label>{correction.type === "return" && <label>จัดการสิทธิ์<select value={disposition} onChange={e => setDisposition(e.target.value)}><option value="replace">คืนเพื่อเปลี่ยน เปิดสิทธิ์ใหม่</option><option value="close">คืนปิดเรื่อง ไม่เปิดสิทธิ์ใหม่</option></select></label>}<button className="button" disabled={busy || reason.trim().length < 5} onClick={saveCorrection}>บันทึกเหตุการณ์ใหม่</button><button onClick={() => setCorrection(null)}>ย้อนกลับ</button></section>}
    {pending && <section><h2>ยอดตั้งต้นรอแชมป์ยืนยัน</h2><p>{pending.length} บรรทัด · ไม่มีการ import · ยอดเคยรับ ยกเลิก และค้างรับยังไม่รับรอง</p><button onClick={() => exportData(pending, "opening-balances-pending.json")}><Download size={18} aria-hidden /> ส่งออกรายการรอยืนยัน</button>{pending.map((l, i) => <article key={`${l.key}:${i}`} className="handover-line"><p>{l.source} · {l.orderId} · {l.phone}</p><p>{l.productName} · ตามต้นทาง {l.entitlement} {l.unit}</p><p>เคยรับ / ยกเลิก / ค้างรับ: รอยืนยัน</p></article>)}</section>}
  </main>;
}
