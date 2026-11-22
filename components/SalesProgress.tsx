import { HeroProgress } from "./HeroProgress.tsx";
import Link from "next/link";
import { loadTeamTargets } from "../lib/team-targets-server.ts";
import { resolveEmployeeCode } from "../lib/employee-directory.ts";
import { pace } from "../lib/team-targets.ts";

const money = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
export async function SalesProgress({ compact = false, selfCode }: { compact?: boolean; selfCode?: string | null }) {
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const month = today.slice(0, 7), day = Number(today.slice(8)), [year, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, m, 0)).getUTCDate();
  try {
    const { targets, progress, heroConfig, currentHero, employeeNames } = await loadTeamTargets(month);
    const label = "ยอดขายสินค้า";
    const amount = progress.product;
    const target = targets?.revenueTarget || 0, stats = pace(amount, target, day, days);
    const max = Math.max(1, ...Object.values(progress.daily).map(d => d.product));
    return <section className="sales-progress" aria-label="ยอดเดือนนี้">
      <div className="sales-heading"><div><h2>ยอดเดือนนี้</h2><p>ข้อมูลถึงวันที่ {day}/{m}/{year + 543} · เวลาไทย</p></div>{compact && <Link href="/sales-progress">ดูรายละเอียด →</Link>}</div>
      <p className="sales-caption">ยอดขายสินค้า (ไม่นับพรี ไม่นับกิจกรรม)</p><p className="sales-hero">{money(progress.product)} <span>บาท</span></p>
      <div className="sales-totals"><p>ค่ากิจกรรม <strong>{money(progress.event)} บาท</strong></p><p>รวมทั้งร้าน (ไม่นับพรี) <strong>{money(progress.store)} บาท</strong></p></div>
      <div className="sales-target"><p>เป้าเดือน {target ? `${money(target)} บาท` : "ยังไม่ตั้งเป้า"}</p><p>เทียบจาก {label} · {stats.percent == null ? "ยังไม่ตั้งเป้า" : `${money(stats.percent)}%`}</p>{target > 0 && <div className="sales-bar" role="progressbar" aria-label={`ความคืบหน้า ${label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, stats.percent || 0))}><span style={{ width: `${Math.min(100, Math.max(0, stats.percent || 0))}%` }} /></div>}</div>
      {heroConfig && currentHero && <HeroProgress heroConfig={heroConfig} currentHero={currentHero} personalUnits={selfCode ? Object.entries(currentHero.staff).reduce((sum, [id, units]) => sum + (employeeNames[id] && resolveEmployeeCode(employeeNames[id]) === selfCode ? units : 0), 0) : undefined} />}
      {!compact && <><div className="sales-totals"><p>เหลืออีก <strong>{target ? `${money(stats.remaining)} บาท` : "ยังไม่ตั้งเป้า"}</strong></p><p>ต้องได้วันละ <strong>{!target ? "ยังไม่ตั้งเป้า" : stats.neededPerDay === null ? "หมดเดือนแล้ว" : `${money(stats.neededPerDay)} บาท`}</strong></p><p>คาดการณ์สิ้นเดือน <strong>{money(stats.forecast)} บาท</strong></p><p>คำนวณจาก {label} เฉลี่ย {day} วัน × {days} วัน</p></div>
      <h3>แยกตามสาขา</h3><p className="sales-caption">รวมทั้งร้าน ไม่นับพรี</p><div className="sales-totals">{([["บางแค", progress.branches.bangkae], ["เสนาเฟสท์", progress.branches.senafest], ["ออนไลน์", progress.branches.online]] as const).map(([name, value]) => <p key={name}>{name}<strong>{money(value)} บาท</strong></p>)}</div>
      <h3>ยอดรายวัน</h3><p className="sales-caption">{label}</p><div className="sales-days">{Array.from({ length: day }, (_, i) => { const date = `${month}-${String(i + 1).padStart(2, "0")}`; const row = progress.daily[date]; const value = row ? row.product : 0; return <div className="sales-day" key={date}><span>{i + 1}</span><div className="sales-bar"><span style={{ width: `${Math.max(0, value) / max * 100}%` }} /></div><strong>{money(value)}</strong></div>; })}</div></>}
    </section>;
  } catch { return <section className="sales-progress"><h2>ยอดเดือนนี้</h2><p>โหลดข้อมูลไม่ได้ กรุณาลองใหม่อีกครั้ง</p>{compact && <Link href="/sales-progress">ดูรายละเอียด →</Link>}</section>; }
}
