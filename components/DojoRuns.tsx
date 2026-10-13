"use client";

import { useEffect, useRef, useState } from 'react';
import { Check, Plus, RefreshCw, RotateCcw, Send, X, ExternalLink } from 'lucide-react';
import { RUN_JOBS, RUN_STAGES, RUN_STATUS_TH, canApprove, canRedo, liveState, proceedStage, type Run, type RunStage } from '../lib/dojo-runs.ts';
import './DojoRuns.css';

const messages: Record<string, string> = {
  forbidden: 'ต้องเข้าสู่ระบบด้วยบัญชีที่มีสิทธิ์', storage_unavailable: 'ยังเชื่อมต่อข้อมูลโปสเตอร์ไม่ได้',
  conflict: 'งานนี้เปลี่ยนสถานะไปแล้ว โหลดล่าสุดแล้วลองใหม่ ข้อความยังอยู่', comment_required: 'พิมพ์ก่อนว่าต้องแก้อะไร',
  not_found: 'ไม่พบงานนี้แล้ว', invalid_request: 'ข้อมูลไม่ครบ', read_failed: 'โหลดไม่สำเร็จ ลองใหม่อีกครั้ง',
  write_failed: 'บันทึกไม่สำเร็จ ข้อความยังอยู่ ลองใหม่อีกครั้ง'
};
const when = (t: number) => t ? new Date(t).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const stageLabel = (k: string) => RUN_STAGES.find(s => s.key === k)?.label || k;
const ago = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s} วินาที` : s < 3600 ? `${Math.floor(s / 60)} นาที` : `${Math.floor(s / 3600)} ชม.`; };
function useNow(every = 5000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), every); return () => clearInterval(t); }, [every]);
  return now;
}

function useDraft(key: string) {
  const [v, setV] = useState('');
  useEffect(() => { try { setV(localStorage.getItem(key) ?? ''); } catch {} }, [key]);
  const set = (x: string) => { setV(x); try { x ? localStorage.setItem(key, x) : localStorage.removeItem(key); } catch {} };
  return [v, set] as const;
}

async function post(body: object) {
  const r = await fetch('/api/admin/dojo-runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'write_failed');
  return d;
}

export function DojoRuns({ reviewer, authenticated }: { reviewer: string; authenticated: boolean }) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [cur, setCur] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [zoom, setZoom] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load(quiet = false) {
    if (!quiet) setLoading(true);
    try {
      const r = await fetch('/api/admin/dojo-runs', { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setRuns(d.runs);
      setCur(c => (c && d.runs.some((x: Run) => x.id === c)) ? c : (new URLSearchParams(location.search).get('run') || d.runs[0]?.id || null));
      if (!quiet) setNotice('');
    } catch (e) { if (!quiet) setNotice(messages[e instanceof Error ? e.message : ''] || messages.read_failed); }
    finally { if (!quiet) setLoading(false); }
  }
  useEffect(() => {
    if (!authenticated) return;
    void load();
    // งานบน mini อัปเดตเรื่อยๆ — ดึงใหม่ทุก 10 วิ เฉพาะตอนเปิดหน้านี้อยู่ (ไม่ทับข้อความที่พิมพ์ เพราะเก็บแยกใน draft)
    timer.current = setInterval(() => { if (document.visibilityState === 'visible') void load(true); }, 10_000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [authenticated]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setZoom(''); setShowNew(false); } };
    addEventListener('keydown', esc); return () => removeEventListener('keydown', esc);
  }, []);

  if (!authenticated) return <p className="input-status warning">โหมดตัวอย่าง: เข้าสู่ระบบจริงเพื่อดูและสั่งงานโปสเตอร์</p>;
  const run = runs.find(r => r.id === cur);
  const pick = (id: string) => { setCur(id); history.replaceState(null, '', '?run=' + encodeURIComponent(id)); };

  return <div className="runs">
    <div className="runs-toolbar">
      <button className="btn" onClick={() => setShowNew(true)}><Plus size={18} />สั่งงานใหม่</button>
      <button className="btn-soft" onClick={() => load()} disabled={loading}><RefreshCw size={18} />{loading ? 'กำลังโหลด' : 'โหลดล่าสุด'}</button>
    </div>
    {notice && <p role="status" className="input-status warning">{notice}</p>}
    {runs.length > 0 && <div className="runs-list" role="tablist" aria-label="งานโปสเตอร์">
      {runs.map(r => <button key={r.id} role="tab" aria-selected={r.id === cur} className="runs-card" onClick={() => pick(r.id)}>
        <b title={r.title}>{r.title}</b>
        <span className={`runs-chip s-${r.status}`}>{RUN_STATUS_TH[r.status] || r.status}</span>
        <small>{when(r.updatedAt)}</small>
      </button>)}
    </div>}
    {!loading && !runs.length && <p className="runs-empty">ยังไม่มีงาน กด "สั่งงานใหม่"</p>}
    {run && <RunDetail key={run.id} run={run} reviewer={reviewer} onZoom={setZoom} onSaved={m => { setNotice(m); void load(true); }} />}
    {showNew && <NewRun reviewer={reviewer} onClose={() => setShowNew(false)} onCreated={id => { setShowNew(false); setNotice('สั่งงานแล้ว ระบบจะเริ่มทำภายใน 1–2 นาที'); setCur(id); void load(true); }} />}
    {zoom && <button className="runs-zoom" onClick={() => setZoom('')} aria-label="ปิดภาพ"><img src={zoom} alt="" /></button>}
  </div>;
}

function RunDetail({ run, reviewer, onZoom, onSaved }: { run: Run; reviewer: string; onZoom: (u: string) => void; onSaved: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function approve() {
    setBusy(true); setError('');
    try { await post({ action: 'approve', id: run.id }); onSaved('ผ่านแล้ว ระบบจะเอาเข้าเครื่องมือทำโพสให้'); }
    catch (e) { setError(messages[e instanceof Error ? e.message : ''] || messages.write_failed); }
    finally { setBusy(false); }
  }
  return <section className="runs-detail">
    <p className="eyebrow">{RUN_JOBS.find(([k]) => k === run.brief.job)?.[1] || run.brief.job} · รอบ {run.round}</p>
    <h3>{run.title}</h3>
    {(run.brief.query || run.brief.note) && <p className="runs-brief">{run.brief.query && <>คำค้น: {run.brief.query}</>}{run.brief.query && run.brief.note && ' · '}{run.brief.note}</p>}
    <div className="runs-head-actions">
      <span className={`runs-chip s-${run.status}`}>{RUN_STATUS_TH[run.status] || run.status}</span>
      {canApprove(run) && <button className="btn" onClick={approve} disabled={busy}><Check size={18} />ผ่าน ลงเทมเพลต</button>}
    </div>
    {error && <p role="alert" className="input-status warning">{error}</p>}
    <LiveBar run={run} />
    {run.redo && (run.status === 'redo' || run.status === 'queued') && <p className="runs-note">
      <b>สั่งแก้แล้ว: {stageLabel(run.redo.from)}</b>{run.redo.pick != null && ` · ใช้ ref #${run.redo.pick}`}<br />{run.redo.note}<br />
      <small>{run.status === 'queued' ? 'ระบบรับงานแล้ว กำลังทำ' : 'รอระบบรับงาน (ภายใน 1–2 นาที)'}</small></p>}
    <ol className="runs-stages">
      {run.stages.map((s, i) => <Stage key={s.key} n={i + 1} run={run} s={s} reviewer={reviewer} onZoom={onZoom} onSaved={onSaved} />)}
    </ol>
    {run.log.length > 0 && <div className="runs-log"><p className="eyebrow">ประวัติการสั่ง</p><ul>
      {[...run.log].reverse().map((l, i) => <li key={i}><b>{stageLabel(l.stage)}</b> · {l.note}{l.pick != null && ` · ใช้ #${l.pick}`} — {l.by.split('@')[0]} {when(l.at)}</li>)}
    </ul></div>}
  </section>;
}

function LiveBar({ run }: { run: Run }) {
  const now = useNow();
  const st = liveState(run, now);
  if (st === 'idle') return null;
  const cur = run.stages.find(s => ['running', 'redo'].includes(s.status));
  if (st === 'queued') return <p className="runs-live queued" role="status"><span className="runs-dot" />รอคิว — ระบบจะเริ่มทำภายในไม่กี่วินาที (ถ้ามีงานอื่นทำอยู่จะรอให้เสร็จก่อน)</p>;
  if (st === 'stalled') return <p className="runs-live stalled" role="status"><span className="runs-dot" />ไม่มีความเคลื่อนไหว {ago(now - run.live!.at)} — อาจค้าง ถ้าเกิน 15 นาทีแจ้งแชมป์</p>;
  return <p className="runs-live working" role="status"><span className="runs-dot" />
    กำลังทำ{cur ? ` "${cur.label}"` : ''}{cur?.progress != null ? ` ${cur.progress}%` : ''} · อัปเดตล่าสุด {ago(now - run.live!.at)}ที่แล้ว{run.live?.started ? ` · ทำมาแล้ว ${ago(now - run.live.started)}` : ''}</p>;
}

function Stage({ n, run, s, reviewer, onZoom, onSaved }: { n: number; run: Run; s: RunStage; reviewer: string; onZoom: (u: string) => void; onSaved: (m: string) => void }) {
  const [note, setNote] = useDraft(`sop-dojo-run:${reviewer}:${run.id}:${s.key}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hint = RUN_STAGES.find(x => x.key === s.key)?.hint;
  const open = s.status !== 'todo';
  const editable = open && canRedo(run);
  async function proceed() {
    setBusy(true); setError('');
    try { await post({ action: 'proceed', id: run.id, stage: s.key }); onSaved(`ผ่าน "${s.label}" แล้ว ระบบจะทำขั้นต่อไป`); }
    catch (e) { setError(messages[e instanceof Error ? e.message : ''] || messages.write_failed); }
    finally { setBusy(false); }
  }
  async function redo(pick?: number) {
    if (pick == null && !note.trim()) { setError(messages.comment_required); return; }
    setBusy(true); setError('');
    try {
      await post({ action: 'redo', id: run.id, stage: s.key, note, ...(pick != null ? { pick } : {}) });
      setNote('');
      onSaved(`ส่งแล้ว ระบบจะทำใหม่ตั้งแต่ "${s.label}"`);
    } catch (e) { setError(messages[e instanceof Error ? e.message : ''] || messages.write_failed); }
    finally { setBusy(false); }
  }
  return <li className={`runs-stage s-${s.status}`}>
    <div className="runs-stage-head">
      <span className="runs-num" aria-hidden>{s.status === 'done' ? <Check size={16} /> : n}</span>
      <h4>{s.label}</h4>
      <span className={`runs-chip s-${s.status}`}>{RUN_STATUS_TH[s.status] || s.status}</span>
      {s.at > 0 && <small>{when(s.at)}</small>}
    </div>
    {!open && <p className="runs-hint">{hint}</p>}
    {(s.status === 'running' || s.status === 'redo') && <div className="runs-progress">
      <div className={s.progress == null ? 'runs-bar indeterminate' : 'runs-bar'} role="progressbar" aria-label={`ความคืบหน้า ${s.label}`}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.progress ?? undefined}><span style={s.progress == null ? undefined : { width: `${s.progress}%` }} /></div>
      <small>{s.progress == null ? (s.status === 'redo' ? 'รอเริ่มแก้' : 'กำลังเริ่ม') : `${s.progress}%`}{s.progressNote && ` · ${s.progressNote}`}</small>
    </div>}
    {open && <div className="runs-stage-body">
      {s.summary && <p className="runs-summary">{s.summary}</p>}
      {s.metrics.length > 0 && <p className="runs-metrics">{s.metrics.map((m, i) => <span key={i}>{m.label} <b>{m.value}</b></span>)}</p>}
      {s.items.length > 0 && <div className="runs-imgs">{s.items.map((it, i) =>
        <figure key={i}><button onClick={() => onZoom(it.img)} aria-label={`ขยาย ${it.caption}`}><img src={it.img} alt={it.caption} loading="lazy" /></button><figcaption>{it.caption}</figcaption></figure>)}</div>}
      {s.cands.length > 0 && <>
        <p className="eyebrow runs-cands-title">ตัวเลือก ref · กดเลือกรูปอื่นได้ ระบบจะทำใหม่จากรูปนั้น</p>
        <div className="runs-cands">{s.cands.map((c, i) => {
          const on = s.picked === i + 1;
          return <div key={i} className={on ? 'runs-cand on' : 'runs-cand'}>
            <button className="runs-cand-img" onClick={() => onZoom(c.img)} aria-label={`ขยายรูป #${i + 1}`}><img src={c.img} alt="" loading="lazy" /><span>{c.caption || `#${i + 1}`}</span></button>
            <button className="runs-cand-pick" disabled={on || busy || !editable} onClick={() => redo(i + 1)}>{on ? 'ใช้อันนี้อยู่' : 'ใช้อันนี้แทน'}</button>
          </div>;
        })}</div>
      </>}
      {s.links.length > 0 && <p className="runs-links">{s.links.map((l, i) => <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />{l.label}</a>)}</p>}
      {proceedStage(run) === s.key && <div className="runs-gate">
        <p><b>รอดูก่อนไปต่อ</b> — ดูภาพเทียบด้านบน ถ้าเหมือนต้นแบบแล้วกดไปต่อ ถ้ายังไม่เหมือนพิมพ์บอกด้านล่างว่าต่างตรงไหน</p>
        <button className="btn" onClick={proceed} disabled={busy}><Check size={18} />เหมือนแล้ว ไปขั้นต่อไป</button>
      </div>}
      {editable && <fieldset className="runs-fix" disabled={busy}>
        <label htmlFor={`fix-${run.id}-${s.key}`}>ขั้นนี้ผิดตรงไหน / ต้องเป็นแบบไหน</label>
        <textarea id={`fix-${run.id}-${s.key}`} rows={3} maxLength={5000} value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น ตัวหนังสือเล็กไป อ่านในมือถือไม่ออก" />
        <div className="runs-fix-actions">
          <button className="btn" onClick={() => redo()}><RotateCcw size={18} />แก้ขั้นนี้ แล้วทำต่อ</button>
          {note && <button className="btn-soft" onClick={() => setNote('')}><X size={18} />ล้างข้อความ</button>}
        </div>
        {error && <p role="alert" className="input-status warning">{error}</p>}
      </fieldset>}
    </div>}
  </li>;
}

function NewRun({ reviewer, onClose, onCreated }: { reviewer: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [job, setJob] = useState<string>(RUN_JOBS[0][0]);
  const [query, setQuery] = useDraft(`sop-dojo-new:${reviewer}:query`);
  const [note, setNote] = useDraft(`sop-dojo-new:${reviewer}:note`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    setBusy(true); setError('');
    try { const d = await post({ action: 'create', job, query, note }); setQuery(''); setNote(''); onCreated(d.id); }
    catch (e) { setError(messages[e instanceof Error ? e.message : ''] || messages.write_failed); }
    finally { setBusy(false); }
  }
  return <div className="runs-modal" role="dialog" aria-modal="true" aria-labelledby="runs-new-title">
    <fieldset className="runs-modal-card" disabled={busy}>
      <h3 id="runs-new-title">สั่งงานโปสเตอร์ใหม่</h3>
      <label htmlFor="runs-job">งาน</label>
      <select id="runs-job" value={job} onChange={e => setJob(e.target.value)}>{RUN_JOBS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <label htmlFor="runs-query">คำค้น Pinterest (เว้นว่างได้ ระบบเลือกเอง)</label>
      <input id="runs-query" value={query} maxLength={200} onChange={e => setQuery(e.target.value)} placeholder="เช่น riso weekly schedule poster" />
      <label htmlFor="runs-note">อยากได้แบบไหน</label>
      <textarea id="runs-note" rows={3} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น โทนญี่ปุ่น สีเขียว ตัวหนังสือใหญ่" />
      {error && <p role="alert" className="input-status warning">{error}</p>}
      <div className="runs-modal-actions"><button className="btn-soft" onClick={onClose}>ยกเลิก</button><button className="btn" onClick={go}><Send size={18} />สั่งงาน</button></div>
    </fieldset>
  </div>;
}
