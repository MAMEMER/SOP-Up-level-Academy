import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth.ts";
import { isOwner } from "../../../../lib/owner.ts";
import { STOCK_LOSS_REPORTS, reportTotals } from "../../../../lib/stock-loss-reports.ts";

// ของหาย น้ำ/ขนม — มูลค่าเงิน เห็นเฉพาะเจ้าของ

type PageProps = { searchParams?: Promise<{ r?: string }> };

const baht = (value: number) =>
  value.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export default async function StockLossPage({ searchParams }: PageProps) {
  const user = await requireUser();
  if (!isOwner(user.actualEmail)) redirect("/admin");
  const params = (await searchParams) || {};
  const report = STOCK_LOSS_REPORTS.find((entry) => entry.id === params.r) || STOCK_LOSS_REPORTS[0];
  const totals = reportTotals(report);
  const items = [...report.items].sort((a, b) => b.qty * b.unitPrice - a.qty * a.unitPrice);

  return (
    <main className="page sdoc-page">
      <Link href="/admin" className="back-link">← ศูนย์รวมงานจัดการ</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">ของหาย · เฉพาะเจ้าของ</p>
          <h2>น้ำ/ขนม บางแค</h2>
          <p>หาย = นับต้นรอบ + รับเข้า − นับปลายรอบ − ขายจริง · ไม่นับมาม่า · มูลค่าตามราคาขายจริงรวม VAT</p>
        </div>
      </section>

      <nav className="stock-loss-tabs" aria-label="เลือกรอบ">
        {STOCK_LOSS_REPORTS.map((entry) => (
          <Link
            key={entry.id}
            href={`/admin/stock-loss?r=${entry.id}`}
            className={entry.id === report.id ? "is-active" : undefined}
            aria-current={entry.id === report.id ? "page" : undefined}
          >
            {entry.label}
          </Link>
        ))}
      </nav>

      <section className="sdoc-section">
        <p className="eyebrow">{report.period} · {report.days} วัน</p>
        <div className="flower-target-stats stock-loss-stats">
          <div><small>มูลค่าที่หาย</small><strong>{baht(totals.value)}฿</strong></div>
          <div><small>จำนวน</small><strong>{totals.qty} ชิ้น</strong></div>
          <div><small>เฉลี่ยต่อวัน</small><strong>{baht(Math.round(totals.perDay))}฿</strong></div>
          <div><small>ถ้าคิดราคาป้ายเต็ม</small><strong>{baht(totals.label)}฿</strong></div>
        </div>
      </section>

      <section className="sdoc-section">
        <p className="eyebrow">รายการที่หาย</p>
        <ul className="stock-loss-list">
          {items.map((item) => (
            <li key={item.name}>
              <span className="stock-loss-name">
                {item.name}
                {item.note ? <small>{item.note}</small> : null}
              </span>
              <span className="stock-loss-qty">{item.qty} × {baht(item.unitPrice)}</span>
              <strong className="stock-loss-value">{baht(item.qty * item.unitPrice)}฿</strong>
            </li>
          ))}
        </ul>
        <p className="sdoc-hint">นับตรงกับยอดขาย {report.exactCount} รายการ · ตัดเลขนับที่กรอกผิดออกก่อนคำนวณ {report.countErrors} จุด</p>
      </section>

      <section className="sdoc-section">
        <p className="eyebrow">ที่ควรดู</p>
        <ul className="stock-loss-findings">
          {report.findings.map((finding) => (
            <li key={finding.title}>
              <strong>{finding.title}</strong>
              <span>{finding.detail}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
