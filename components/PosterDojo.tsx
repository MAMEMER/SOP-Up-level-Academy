"use client";

import { useEffect, useState } from 'react';
import { Check, RefreshCw, RotateCcw, X, ExternalLink } from 'lucide-react';
import { reviewable, type Poster } from '../lib/poster-dojo.ts';
import './PosterDojo.css';

const filters = [['pending', 'รอรีวิว'], ['reworking', 'กำลังแก้'], ['approved', 'ผ่าน'], ['rejected', 'ไม่เอา']] as const;
const messages: Record<string, string> = {
  forbidden: 'ต้องเข้าสู่ระบบด้วยบัญชีที่มีสิทธิ์รีวิว', storage_unavailable: 'ยังเชื่อมต่อข้อมูลโปสเตอร์ไม่ได้',
  conflict: 'มีคนรีวิวหรือแก้ใบนี้แล้ว โหลดข้อมูลล่าสุดก่อนส่งอีกครั้ง คอมเมนต์ยังอยู่',
  comment_required: 'กรุณาพิมพ์ความเห็นก่อนส่ง', read_failed: 'โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง',
  write_failed: 'บันทึกไม่สำเร็จ คอมเมนต์ยังอยู่ ลองใหม่อีกครั้ง'
};

export function PosterDojo({ reviewer, authenticated }: { reviewer: string; authenticated: boolean }) {
  const [posters, setPosters] = useState<Poster[]>([]);
  const [filter, setFilter] = useState('pending');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  async function load() {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/dojo', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPosters(data.posters); setNotice('');
    } catch (error) { setNotice(messages[error instanceof Error ? error.message : ''] || 'โหลดข้อมูลไม่สำเร็จ'); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (authenticated) void load(); }, [authenticated]);
  if (!authenticated) return <p className="input-status warning">โหมดตัวอย่าง: เข้าสู่ระบบจริงเพื่อโหลดและรีวิวโปสเตอร์</p>;
  return <div className="dojo">
    <div className="dojo-toolbar"><p>ผู้รีวิว: {reviewer}</p><button className="btn-soft" onClick={load} disabled={loading}><RefreshCw size={18} />{loading ? 'กำลังโหลด' : 'โหลดล่าสุด'}</button></div>
    <div className="dojo-filters" aria-label="สถานะโปสเตอร์">{filters.map(([value, label]) => <button key={value} className="btn-soft" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label} · {posters.filter(p => value === 'pending' ? reviewable(p.status) : p.status === value).length}</button>)}</div>
    {notice && <p role="status" className="input-status warning">{notice}</p>}
    {!loading && !posters.some(p => filter === 'pending' ? reviewable(p.status) : p.status === filter) && <p className="dojo-empty">ไม่มีโปสเตอร์ในหมวดนี้</p>}
    {posters.filter(p => filter === 'pending' ? reviewable(p.status) : p.status === filter).map(p => <PosterReview key={p.id} poster={p} reviewer={reviewer} onSaved={() => { setNotice('บันทึกรีวิวแล้ว'); void load(); }} />)}
  </div>;
}

function PosterReview({ poster: p, reviewer, onSaved }: { poster: Poster; reviewer: string; onSaved: () => void }) {
  const key = `sop-dojo-draft:${reviewer}:${p.id}`;
  const [comment, setComment] = useState('');
  const [asRule, setAsRule] = useState(false);
  const [severity, setSeverity] = useState('major');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    try { setComment(localStorage.getItem(key) ?? p.champ_comment ?? ''); }
    catch { setComment(p.champ_comment || ''); setError('เบราว์เซอร์ไม่อนุญาตให้เก็บร่าง กรุณาอย่าปิดหน้าก่อนส่ง'); }
  }, [key]);
  function edit(value: string) {
    setComment(value);
    try { localStorage.setItem(key, value); }
    catch { setError('เก็บร่างไม่ได้ กรุณาอย่าปิดหน้าก่อนส่ง'); }
  }
  async function submit(action: string) {
    if ((action !== 'approved' || asRule) && !comment.trim()) { setError(messages.comment_required); return; }
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/dojo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, version: p.version, action, comment, asRule, severity }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      try { localStorage.removeItem(key); } catch {}
      onSaved();
    } catch (e) { setError(messages[e instanceof Error ? e.message : ''] || messages.write_failed); }
    finally { setBusy(false); }
  }
  function image(url: string, label: string) {
    return url ? <a className="dojo-image" href={url} target="_blank" rel="noopener noreferrer" aria-label={`${label} เปิดภาพเต็ม`}><img src={url} alt={label} loading="lazy" /></a> : null;
  }
  return <article className="dojo-poster">
    <header><h3 title={p.name}>{p.name}</h3><p>{p.grade !== null ? `${p.grade}/100 · ` : ''}{p.verdict} · {filters.find(([status]) => status === p.status)?.[1] || 'รอรีวิว'}{p.rework_round > 0 && ` · รอบแก้ ${p.rework_round}`}</p></header>
    {p.sidebysideUrl ? image(p.sidebysideUrl, `ภาพเทียบ ${p.name}`) : <div className="dojo-comparison">{image(p.refImage, 'ภาพอ้างอิง')}{image(p.imageUrl, p.name)}</div>}
    {!p.sidebysideUrl && !p.imageUrl && <p>ยังไม่มีภาพโปสเตอร์</p>}
    {p.refUrl && <a className="dojo-reference" href={p.refUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={18} />เปิดที่มาภาพอ้างอิง</a>}
    {p.fails.length > 0 && <ul>{p.fails.map((fail, i) => <li key={i}>{fail}</li>)}</ul>}
    {p.reviewed_by && <p className="dojo-stamp">รีวิวล่าสุด: {p.reviewed_by}</p>}
    {p.champ_comment && <p className="dojo-comment">ความเห็นล่าสุด: {p.champ_comment}</p>}
    {reviewable(p.status) && <fieldset disabled={busy} className="dojo-form">
      <label htmlFor={`comment-${p.id}`}>ความเห็น / จุดที่ต้องแก้</label>
      <textarea id={`comment-${p.id}`} value={comment} onChange={e => edit(e.target.value)} rows={3} maxLength={10000} />
      <div className="dojo-rule"><label><input type="checkbox" checked={asRule} onChange={e => setAsRule(e.target.checked)} />เพิ่มเป็นกฎ</label>{asRule && <select aria-label="ระดับความสำคัญของกฎ" value={severity} onChange={e => setSeverity(e.target.value)}><option value="minor">เล็กน้อย</option><option value="major">สำคัญ</option><option value="critical">ต้องแก้เสมอ</option></select>}</div>
      <div className="dojo-actions"><button className="btn" onClick={() => submit('approved')}><Check size={18} />ผ่าน</button><button className="btn-soft" onClick={() => submit('revise')}><RotateCcw size={18} />ให้แก้</button><button className="btn-soft" onClick={() => submit('rejected')}><X size={18} />ไม่เอา</button></div>
      <button className="dojo-reset btn-soft" onClick={() => edit('')}>ล้างคอมเมนต์</button>
      {busy && <p role="status">กำลังบันทึก</p>}
      {error && <p role="alert" className="input-status warning">{error}</p>}
    </fieldset>}
  </article>;
}
