"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { GAMES, group4Score, incentivePool, splitPool, type Game, type TeamActuals, type TeamTargets } from "../lib/team-targets.ts";
const labels: Record<Game, string> = { pokemon: "Pokémon", lorcana: "Lorcana", riftbound: "Riftbound", monsnatch: "Monsnatch" };
const empty = (): TeamTargets => ({ targetBasis: "product_only", revenueTarget: 0, eventTargets: { pokemon: 0, lorcana: 0, riftbound: 0, monsnatch: 0 }, budgetTarget: 0, poolRevenuePct: 10, poolPerGame: 0, passWeeks: 3 });
type Report = { targets: TeamTargets | null; actuals: TeamActuals; weeks: string[]; passed: Record<Game, number> | null; hours: Array<{ code: string; hours: number }> };
const money = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
export function TeamTargetsBoard() {
  const [month, setMonth] = useState(() => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7));
  const [form, setForm] = useState<TeamTargets>(empty);
  const [report, setReport] = useState<Report | null>(null);
  const [eligible, setEligible] = useState("");
  const [spend, setSpend] = useState("");
  const [message, setMessage] = useState("กำลังโหลดข้อมูล");
  const load = useCallback(async (m: string, codes = "", copy = false) => {
    setMessage("กำลังโหลดข้อมูล");
    try {
      const res = await fetch(`/api/team-targets?${new URLSearchParams({ month: m, eligible: codes })}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (copy) { updateCopy(data.targets || empty(), m); setMessage(data.targets ? "คัดลอกแล้ว กรุณากดบันทึก" : "เดือนก่อนยังไม่มีเป้า"); return; }
      setReport(data);
      const savedSpend = localStorage.getItem(`team-targets-spend-${m}`);
      setSpend(savedSpend ?? (data.targets?.budgetActual != null ? String(data.targets.budgetActual) : ""));
      const draft = localStorage.getItem(`team-targets-draft-${m}`);
      setForm({ ...empty(), ...(draft ? JSON.parse(draft) : data.targets || {}) });
      setMessage("");
    } catch { setMessage("โหลดข้อมูลไม่ได้ กรุณาลองใหม่"); }
  }, [month]);
  useEffect(() => { setEligible(localStorage.getItem(`team-targets-eligible-${month}`) || ""); setSpend(localStorage.getItem(`team-targets-spend-${month}`) || ""); void load(month); }, [month, load]);
  function updateCopy(next: TeamTargets, _source: string) { setForm(next); localStorage.setItem(`team-targets-draft-${month}`, JSON.stringify(next)); }
  function update(next: TeamTargets) { setForm(next); localStorage.setItem(`team-targets-draft-${month}`, JSON.stringify(next)); }
  async function save() {
    setMessage("กำลังบันทึก");
    try {
      const res = await fetch("/api/team-targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month, targets: { ...form, budgetActual: spend === "" ? null : Number(spend) } }) });
      if (!res.ok) throw new Error();
      localStorage.removeItem(`team-targets-draft-${month}`);
      localStorage.removeItem(`team-targets-spend-${month}`);
      await load(month, eligible);
      setMessage("บันทึกแล้ว");
    } catch { setMessage("บันทึกไม่ได้ กรุณาลองใหม่"); }
  }
  const revenue = report ? Object.values(report.actuals.revenue).reduce((a, b) => a + b, 0) : 0;
  const targets = report?.targets;
  const games = targets ? GAMES.filter(g => targets.eventTargets[g] > 0) : [];
  const avgWeeks = report?.passed && games.length ? games.reduce((sum, g) => sum + (report.passed?.[g] || 0), 0) / games.length : 0;
  const score = targets && report ? group4Score(revenue, targets.revenueTarget, avgWeeks, games.length ? report.weeks.length : 0, targets.budgetTarget, spend === "" ? undefined : Number(spend)) : undefined;
  const pool = targets && report?.passed ? incentivePool(revenue, targets, report.passed) : 0;
  const prev = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  const numberField = (label: string, value: number, change: (n: number) => void) => <label className="team-target-field">{label}<input type="number" min="0" step="any" value={value} onChange={e => change(Number(e.target.value))} /></label>;
  return <>
    <Link href="/admin" className="back-link">← ศูนย์รวมงานจัดการ</Link>
    <section className="board-hero"><div><p className="eyebrow">เฉพาะเจ้าของ</p><h2>เป้าทีมและกองทุน</h2><p>ตั้งเป้ารายเดือนและดูความคืบหน้าทั้งสองสาขา</p></div></section>
    <section className="sdoc-section team-target-section"><label className="team-target-field">เดือน<input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} /></label><p role="status">{message}</p>
      <h3>ตั้งเป้าของเดือน</h3><div className="team-target-grid">
        {numberField("เป้ายอดขายสินค้า (ไม่นับพรีและกิจกรรม) ต่อเดือน (บาท)", form.revenueTarget, n => update({ ...form, revenueTarget: n }))}
        {GAMES.map(g => <div key={g}>{numberField(`เป้า ${labels[g]} ต่อสัปดาห์ (คน)`, form.eventTargets[g], n => update({ ...form, eventTargets: { ...form.eventTargets, [g]: n } }))}</div>)}
        {numberField("เป้างบประมาณ (บาท)", form.budgetTarget, n => update({ ...form, budgetTarget: n }))}
        {numberField("สัดส่วนยอดขายที่เกินเป้าเข้ากองทุน (%)", form.poolRevenuePct, n => update({ ...form, poolRevenuePct: n }))}
        {numberField("เพิ่มกองทุนต่อเกมที่ผ่านเป้า", form.poolPerGame, n => update({ ...form, poolPerGame: n }))}
        {numberField("จำนวนสัปดาห์ที่ต้องผ่าน", form.passWeeks, n => update({ ...form, passWeeks: n }))}
      </div><div className="team-target-actions"><button className="green-button" onClick={save} disabled={!report}>บันทึกเป้า</button><button className="soft-button" onClick={() => void load(prev, "", true)}>คัดลอกจากเดือนก่อน</button><button className="soft-button" onClick={() => { localStorage.removeItem(`team-targets-draft-${month}`); setForm(report?.targets || empty()); setSpend(report?.targets?.budgetActual != null ? String(report.targets.budgetActual) : ""); setEligible(""); localStorage.removeItem(`team-targets-spend-${month}`); localStorage.removeItem(`team-targets-eligible-${month}`); }}>รีเซ็ต</button></div>
    </section>
    {report && targets && <section className="sdoc-section team-target-section"><h3>ความคืบหน้าเดือนนี้</h3><p>บางแค {money(report.actuals.revenue.bangkae)} ฿ · เสนาเฟสต์ {money(report.actuals.revenue.senafest)} ฿ · ออนไลน์ {money(report.actuals.revenue.online)} ฿</p><p>รวม {money(revenue)} ฿ · {targets.revenueTarget ? money(revenue / targets.revenueTarget * 100) : "ยังไม่ตั้งเป้า"}%</p>
      <ul>{GAMES.map(g => <li key={g}>{labels[g]}: ผ่าน {report.passed?.[g] || 0} / {report.weeks.length} สัปดาห์ · {report.weeks.map(w => `${w}: ${report.actuals.entries[w]?.[g] || 0}`).join(" · ")}</li>)}</ul>
      <label className="team-target-field">ค่าใช้จ่ายจริง (บาท)<input type="number" min="0" value={spend} onChange={e => { setSpend(e.target.value); localStorage.setItem(`team-targets-spend-${month}`, e.target.value); }} /></label><button className="soft-button" onClick={save}>บันทึกค่าใช้จ่าย</button><p>คะแนนความเป็นเจ้าของกลุ่ม 4: {score == null ? "ยังคำนวณไม่ได้" : `${money(score)}%`}</p><h3>กองทุนจูงใจ {money(pool)} ฿</h3><p>รอคะแนน KPI · ระบุรหัสพนักงานที่มีสิทธิ์โดยคั่นด้วยเครื่องหมายจุลภาค</p><label className="team-target-field">รหัสพนักงาน<input value={eligible} onChange={e => { setEligible(e.target.value); localStorage.setItem(`team-targets-eligible-${month}`, e.target.value); }} /></label><button className="soft-button" onClick={() => void load(month, eligible)}>คำนวณส่วนแบ่ง</button><ul>{splitPool(pool, report.hours).map(x => <li key={x.code}>{x.code}: {money(x.hours)} ชั่วโมง · {money(x.amount)} ฿</li>)}</ul><p>แสดงเพื่อประกอบการพิจารณา ไม่มีการสั่งจ่าย</p></section>}
  </>;
}
