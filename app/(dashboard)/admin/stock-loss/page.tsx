import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth.ts";
import { isOwner } from "../../../../lib/owner.ts";
import { getStockLossReport, type StockLossReport } from "../../../../lib/stock-loss-server.ts";

// ของหาย น้ำ/ขนม — เจ้าของเลือกช่วงวันที่เอง ระบบคำนวณจากผลนับ + ยอดขายจริง (มูลค่าเงิน เห็นเฉพาะเจ้าของ)

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<{ from?: string; to?: string }> };

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const baht = (value: number) =>
  value.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function bangkokToday(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00+07:00`) + days * DAY_MS).toISOString().slice(0, 10);
}

function monthRange(offset: number): [string, string] {
  const [y, m] = bangkokToday().split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + offset, 1));
  const last = new Date(Date.UTC(y, m + offset, 0));
  return [first.toISOString().slice(0, 10), last.toISOString().slice(0, 10)];
}

function thaiDate(date: string): string {
  return new Date(`${date}T12:00:00+07:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });
}

function thaiTime(ms: number): string {
  return new Date(ms).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok"
  });
}

export default async function StockLossPage({ searchParams }: PageProps) {
  const user = await requireUser();
  if (!isOwner(user.actualEmail)) redirect("/admin");
  const params = (await searchParams) || {};
  const today = bangkokToday();
  let to = params.to && DATE_RE.test(params.to) ? params.to : today;
  let from = params.from && DATE_RE.test(params.from) ? params.from : shiftDate(to, -13);
  if (from > to) [from, to] = [to, from];
  // StoreHub transactions ดึงทีละ 7 วัน — จำกัดช่วงไว้ไม่เกิน 3 เดือนกันหน้าโหลดนาน
  if (Date.parse(to) - Date.parse(from) > 92 * DAY_MS) from = shiftDate(to, -92);

  const fromMs = Date.parse(`${from}T00:00:00+07:00`);
  const toMs = Date.parse(`${to}T23:59:59+07:00`);
  const days = Math.round((toMs - fromMs) / DAY_MS);

  let report: StockLossReport | null = null;
  let error = "";
  try {
    report = await getStockLossReport(fromMs, toMs);
  } catch (err) {
    error = err instanceof Error ? err.message : "โหลดข้อมูลไม่ได้";
  }

  const presets: { label: string; range: [string, string] }[] = [
    { label: "14 วันล่าสุด", range: [shiftDate(today, -13), today] },
    { label: "เดือนนี้", range: monthRange(0) },
    { label: "เดือนก่อน", range: monthRange(-1) }
  ];

  return (
    <main className="page sdoc-page">
      <Link href="/admin" className="back-link">← ศูนย์รวมงานจัดการ</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">ของหาย · เฉพาะเจ้าของ</p>
          <h2>น้ำ/ขนม บางแค</h2>
          <p>หาย = นับต้นช่วง + รับเข้า − นับปลายช่วง − ขายจริง · ไม่นับมาม่า · มูลค่าตามราคาขายจริงรวม VAT</p>
        </div>
      </section>

      <form className="stock-loss-range" method="get">
        <label>
          <span>ตั้งแต่</span>
          <input type="date" name="from" defaultValue={from} max={today} />
        </label>
        <label>
          <span>ถึง</span>
          <input type="date" name="to" defaultValue={to} max={today} />
        </label>
        <button type="submit" className="primary-action">ดูผล</button>
      </form>
      <nav className="stock-loss-tabs" aria-label="ช่วงที่ใช้บ่อย">
        {presets.map((preset) => {
          const active = preset.range[0] === from && preset.range[1] === to;
          return (
            <Link
              key={preset.label}
              href={`/admin/stock-loss?from=${preset.range[0]}&to=${preset.range[1]}`}
              className={active ? "is-active" : undefined}
              aria-current={active ? "page" : undefined}
            >
              {preset.label}
            </Link>
          );
        })}
      </nav>

      {error ? (
        <section className="sdoc-section">
          <p className="sdoc-error">{error}</p>
        </section>
      ) : report ? (
        <>
          <section className="sdoc-section">
            <p className="eyebrow">
              {thaiDate(from)} – {thaiDate(to)} · {days} วัน
            </p>
            {report.countRounds < 2 ? (
              <p className="sdoc-help">ช่วงนี้มีผลนับไม่ถึง 2 รอบ เลยคำนวณไม่ได้</p>
            ) : (
              <div className="flower-target-stats stock-loss-stats">
                <div><small>มูลค่าที่หาย</small><strong>{baht(report.totalValue)}฿</strong></div>
                <div><small>จำนวน</small><strong>{report.totalQty} ชิ้น</strong></div>
                <div><small>เฉลี่ยต่อวัน</small><strong>{baht(Math.round(report.totalValue / Math.max(1, days)))}฿</strong></div>
                <div><small>ถ้าคิดราคาป้ายเต็ม</small><strong>{baht(report.totalLabel)}฿</strong></div>
              </div>
            )}
          </section>

          {report.lostRows.length ? (
            <section className="sdoc-section">
              <p className="eyebrow">รายการที่หาย</p>
              <ul className="stock-loss-list">
                {report.lostRows.map((row) => (
                  <li key={row.sku}>
                    <span className="stock-loss-name">
                      {row.name}
                      {row.biggest && row.biggest.qty >= 3 ? (
                        <small>หายก้อนใหญ่ {row.biggest.qty} ชิ้น พบตอนนับ {thaiTime(row.biggest.at)}</small>
                      ) : null}
                      {row.unrecorded >= 5 ? (
                        <small>นับไม่นิ่ง — มีของเพิ่ม {row.unrecorded} ชิ้นโดยไม่ได้กดรับเข้า ตัวเลขนี้เชื่อได้น้อย</small>
                      ) : null}
                    </span>
                    <span className="stock-loss-qty">{row.lost} × {baht(Math.round(row.unitPrice * 100) / 100)}</span>
                    <strong className="stock-loss-value">{baht(Math.round(row.value * 100) / 100)}฿</strong>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="sdoc-section">
            <p className="sdoc-hint">
              ใช้ผลนับ {report.countRounds} รอบ
              {report.firstCount && report.lastCount ? ` (${thaiTime(report.firstCount)} – ${thaiTime(report.lastCount)})` : ""} ·
              นับตรงกับยอดขาย {report.rows.filter((row) => row.lost === 0 && (row.start || row.end || row.sold)).length} รายการ · ตัดเลขนับที่กรอกผิดออก {report.typos} จุด
              {report.syncedAt ? ` · ดึงผลนับจาก StoreHub ล่าสุด ${thaiTime(report.syncedAt)}` : ""}
            </p>
          </section>
        </>
      ) : null}
    </main>
  );
}
