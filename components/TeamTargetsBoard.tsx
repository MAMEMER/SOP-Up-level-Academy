"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { GAMES, group4Score, incentivePool, splitPool, type Game, type TeamActuals, type TeamTargets } from "../lib/team-targets.ts";
const labels: Record<Game, string> = { pokemon: "Pokémon", lorcana: "Lorcana", riftbound: "Riftbound", monsnatch: "Monsnatch" };
const empty = (): TeamTargets => ({ targetBasis: "product_only", revenueTarget: 0, eventTargets: { pokemon: 0, lorcana: 0, riftbound: 0, monsnatch: 0 }, budgetTarget: 0, poolRevenuePct: 10, poolPerGame: 0, passWeeks: 3, heroProducts: [{ name: "Up Level Shield", productIds: ["6a545837c1833900077ce098"], unitTarget: 500, poolBonus: 1000 }] });
type Report = { targets: TeamTargets | null; actuals: TeamActuals; weeks: string[]; passed: Record<Game, number> | null; hours: Array<{ code: string; hours: number }>; heroActuals: Array<{ units: number; staff: Record<string, number> }>; employeeNames: Record<string, string> };
const money = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
export function TeamTargetsBoard() {
  const [heroLabel, setHeroLabel] = useState("");
  const [heroIds, setHeroIds] = useState("");
  const [heroTarget, setHeroTarget] = useState("");
  const [month, setMonth] = useState(() => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7));
  const [form, setForm] = useState<TeamTargets>(empty);
  const [report, setReport] = useState<Report | null>(null);
  const [eligible, setEligible] = useState("");
  const [spend, setSpend] = useState("");
  const [searches, setSearches] = useState<Record<number, string>>({});
  const [results, setResults] = useState<Record<number, Array<{ id: string; name: string }>>>({});
  const [message, setMessage] = useState("กำลังโหลดข้อมูล");
  const load = useCallback(async (m: string, codes = "", copy = false) => {
    setMessage("กำลังโหลดข้อมูล");
    try {
      const res = await fetch(`/api/team-targets?${new URLSearchParams({ month: m, eligible: codes })}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (copy) { updateCopy(data.targets || empty(), m); setMessage(data.targets ? "คัดลอกแล้ว กรุณากดบันทึก" : "เดือนก่อนยังไม่มีเป้า"); return; }
      setReport(data);
      const heroDraft = localStorage.getItem("hero-product-draft");
      const hero = heroDraft ? JSON.parse(heroDraft) : data.heroConfig;
      setHeroLabel(hero?.label || ""); setHeroIds((hero?.productIds || []).join(", ")); setHeroTarget(hero?.monthlyUnitTarget ? String(hero.monthlyUnitTarget) : "");
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
  useEffect(() => { if (!report) return; localStorage.setItem("hero-product-draft", JSON.stringify({ label: heroLabel, productIds: heroIds.split(",").map(x => x.trim()).filter(Boolean), monthlyUnitTarget: heroTarget })); }, [heroLabel, heroIds, heroTarget, report]);
  async function saveHero() {
    const productIds = heroIds.split(",").map(x => x.trim()).filter(Boolean);
    const config = !heroLabel.trim() && !productIds.length ? null : { label: heroLabel, productIds, ...(heroTarget ? { monthlyUnitTarget: Number(heroTarget) } : {}) };
    try { const res = await fetch("/api/team-targets", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) }); if (!res.ok) throw new Error(); localStorage.removeItem("hero-product-draft"); setMessage("บันทึกสินค้าชูโรงแล้ว"); } catch { setMessage("บันทึกสินค้าชูโรงไม่ได้ กรุณาตรวจสอบข้อมูล"); }
  }
  const revenue = report ? Object.values(report.actuals.revenue).reduce((a, b) => a + b, 0) : 0;
  const targets = report?.targets;
  const games = targets ? GAMES.filter(g => targets.eventTargets[g] > 0) : [];
  const avgWeeks = report?.passed && games.length ? games.reduce((sum, g) => sum + (report.passed?.[g] || 0), 0) / games.length : 0;
  const score = targets && report ? group4Score(revenue, targets.revenueTarget, avgWeeks, games.length ? report.weeks.length : 0, targets.budgetTarget, spend === "" ? undefined : Number(spend)) : undefined;
  const pool = targets && report?.passed ? incentivePool(revenue, targets, report.passed, report.heroActuals.map(x => x.units)) : 0;
  const heroes = form.heroProducts || [];
  function setHero(index: number, patch: Partial<(typeof heroes)[number]>) { update({ ...form, heroProducts: heroes.map((hero, i) => i === index ? { ...hero, ...patch } : hero) }); }
  async function searchProducts(index: number) {
    try { const res = await fetch(`/api/team-targets?${new URLSearchParams({ products: searches[index] || "" })}`); if (!res.ok) throw new Error(); const data = await res.json(); setResults(old => ({ ...old, [index]: data.products })); } catch { setMessage("ค้นหาสินค้าไม่ได้ กรุณาลองใหม่"); }
  }
  const prev = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  const numberField = (label: string, value: number, change: (n: number) => void) => <label className="team-target-field">{label}<input type="number" min="0" step="any" value={value} onChange={e => change(Number(e.target.value))} /></label>;
  return <>
    <Link href="/admin" className="back-link">← ศูนย์รวมงานจัดการ</Link>
    <section className="board-hero"><div><p className="eyebrow">เฉพาะเจ้าของ</p><h2>เป้าทีมและกองทุน</h2><p>ตั้งเป้ารายเดือนและดูความคืบหน้าทั้งสองสาขา</p></div></section>
    <section className="sdoc-section team-target-section"><h3>สินค้าชูโรงสำหรับหน้าพนักงาน</h3><label className="team-target-field">ชื่อสินค้า<input value={heroLabel} onChange={e => setHeroLabel(e.target.value)} /></label><label className="team-target-field">รหัสสินค้า StoreHub (คั่นด้วยจุลภาค)<input value={heroIds} onChange={e => setHeroIds(e.target.value)} /></label><label className="team-target-field">เป้าจำนวนต่อเดือน (ไม่บังคับ)<input type="number" min="1" value={heroTarget} onChange={e => setHeroTarget(e.target.value)} /></label><button className="soft-button" type="button" onClick={() => void saveHero()}>บันทึกสินค้าชูโรง</button><button className="soft-button" type="button" onClick={() => { localStorage.removeItem("hero-product-draft"); void load(month, eligible); }}>รีเซ็ต</button></section>
    <section className="sdoc-section team-target-section"><label className="team-target-field">เดือน<input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} /></label><p role="status">{message}</p>
      <h3>ตั้งเป้าของเดือน</h3><div className="team-target-grid">
        {numberField("เป้ายอดขายสินค้า (ไม่นับพรีและกิจกรรม) ต่อเดือน (บาท)", form.revenueTarget, n => update({ ...form, revenueTarget: n }))}
        {GAMES.map(g => <div key={g}>{numberField(`เป้า ${labels[g]} ต่อสัปดาห์ (คน)`, form.eventTargets[g], n => update({ ...form, eventTargets: { ...form.eventTargets, [g]: n } }))}</div>)}
        {numberField("เป้างบประมาณ (บาท)", form.budgetTarget, n => update({ ...form, budgetTarget: n }))}
        {numberField("สัดส่วนยอดขายที่เกินเป้าเข้ากองทุน (%)", form.poolRevenuePct, n => update({ ...form, poolRevenuePct: n }))}
        {numberField("เพิ่มกองทุนต่อเกมที่ผ่านเป้า", form.poolPerGame, n => update({ ...form, poolPerGame: n }))}
        {numberField("จำนวนสัปดาห์ที่ต้องผ่าน", form.passWeeks, n => update({ ...form, passWeeks: n }))}
      </div><h3>สินค้าชูโรง</h3>{heroes.map((hero, i) => <div key={i} className="sales-target"><label className="team-target-field">ชื่อสินค้าชูโรง<input value={hero.name} onChange={e => setHero(i, { name: e.target.value })} /></label><div className="team-target-grid">{numberField("เป้าจำนวน (ชิ้น)", hero.unitTarget, n => setHero(i, { unitTarget: n }))}{numberField("เพิ่มกองทุนเมื่อถึงเป้า (บาท)", hero.poolBonus, n => setHero(i, { poolBonus: n }))}</div><label className="team-target-field">ค้นหาชื่อสินค้า StoreHub<input value={searches[i] || ""} onChange={e => setSearches({ ...searches, [i]: e.target.value })} /></label><button className="soft-button" type="button" onClick={() => void searchProducts(i)}>ค้นหา</button><ul>{(results[i] || []).map(p => <li key={p.id}><label><input type="checkbox" checked={hero.productIds.includes(p.id)} onChange={e => setHero(i, { productIds: e.target.checked ? [...hero.productIds, p.id] : hero.productIds.filter(id => id !== p.id) })} /> {p.name} ({p.id})</label></li>)}</ul><p>รหัสสินค้าที่เลือก: {hero.productIds.join(", ") || "ยังไม่ได้เลือก"}</p><button className="soft-button" type="button" onClick={() => update({ ...form, heroProducts: heroes.filter((_, n) => n !== i) })}>ลบสินค้านี้</button></div>)}<button className="soft-button" type="button" onClick={() => update({ ...form, heroProducts: [...heroes, { name: "", productIds: [], unitTarget: 1, poolBonus: 0 }] })}>เพิ่มสินค้าชูโรง</button><div className="team-target-actions"><button className="green-button" onClick={save} disabled={!report}>บันทึกเป้า</button><button className="soft-button" onClick={() => void load(prev, "", true)}>คัดลอกจากเดือนก่อน</button><button className="soft-button" onClick={() => { localStorage.removeItem(`team-targets-draft-${month}`); setForm(report?.targets || empty()); setSpend(report?.targets?.budgetActual != null ? String(report.targets.budgetActual) : ""); setEligible(""); localStorage.removeItem(`team-targets-spend-${month}`); localStorage.removeItem(`team-targets-eligible-${month}`); }}>รีเซ็ต</button></div>
    </section>
    {report && targets && <section className="sdoc-section team-target-section"><h3>ความคืบหน้าเดือนนี้</h3><p>บางแค {money(report.actuals.revenue.bangkae)} ฿ · เสนาเฟสต์ {money(report.actuals.revenue.senafest)} ฿ · ออนไลน์ {money(report.actuals.revenue.online)} ฿</p><p>รวม {money(revenue)} ฿ · {targets.revenueTarget ? money(revenue / targets.revenueTarget * 100) : "ยังไม่ตั้งเป้า"}%</p>
      {(targets.heroProducts || []).map((hero, i) => <div key={i}><h3>{hero.name}: {money(report.heroActuals[i]?.units || 0)} / {money(hero.unitTarget)} ชิ้น</h3><ul>{Object.entries(report.heroActuals[i]?.staff || {}).map(([id, units]) => <li key={id}>{report.employeeNames[id] || (id === "unknown" ? "ไม่ระบุพนักงาน" : id)}: {money(units)} ชิ้น</li>)}</ul></div>)}<ul>{GAMES.map(g => <li key={g}>{labels[g]}: ผ่าน {report.passed?.[g] || 0} / {report.weeks.length} สัปดาห์ · {report.weeks.map(w => `${w}: ${report.actuals.entries[w]?.[g] || 0}`).join(" · ")}</li>)}</ul>
      <label className="team-target-field">ค่าใช้จ่ายจริง (บาท)<input type="number" min="0" value={spend} onChange={e => { setSpend(e.target.value); localStorage.setItem(`team-targets-spend-${month}`, e.target.value); }} /></label><button className="soft-button" onClick={save}>บันทึกค่าใช้จ่าย</button><p>คะแนนความเป็นเจ้าของกลุ่ม 4: {score == null ? "ยังคำนวณไม่ได้" : `${money(score)}%`}</p><h3>กองทุนจูงใจ {money(pool)} ฿</h3><p>รอคะแนน KPI · ระบุรหัสพนักงานที่มีสิทธิ์โดยคั่นด้วยเครื่องหมายจุลภาค</p><label className="team-target-field">รหัสพนักงาน<input value={eligible} onChange={e => { setEligible(e.target.value); localStorage.setItem(`team-targets-eligible-${month}`, e.target.value); }} /></label><button className="soft-button" onClick={() => void load(month, eligible)}>คำนวณส่วนแบ่ง</button><ul>{splitPool(pool, report.hours).map(x => <li key={x.code}>{x.code}: {money(x.hours)} ชั่วโมง · {money(x.amount)} ฿</li>)}</ul><p>แสดงเพื่อประกอบการพิจารณา ไม่มีการสั่งจ่าย</p></section>}
  </>;
}
