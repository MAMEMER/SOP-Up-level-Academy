import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth.ts";
import { listStaff } from "../../../../lib/staff-store.ts";
import { formatWorkDate } from "../../../../lib/workflow-records.ts";
import { fetchMonthShiftCells, fetchPeerReviews } from "../../../../lib/kpi-v2-store.ts";
import {
  coworkersOf,
  isPeriod,
  peerReviewItems,
  ratingOptions,
  scorePeerReviews
} from "../../../../lib/peer-review.ts";

// ผล 360 รายเดือน (KPI ใหม่ ค2) — เห็นเฉพาะแอดมิน: คะแนนรายคน รายข้อ ใครประเมินใครบ้าง และตัวอย่างที่เขียน.
// คะแนนนี้ใช้กับกลุ่ม 3 ทีมเวิร์ก (360 ของตัวเอง 60%) — ยังไม่ผูก performance-score / เงินเดือน.

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<{ period?: string; staff?: string }> };

function thaiMonth(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

const ratingLabel = (value: number) => ratingOptions.find((option) => option.value === value)?.label || "–";

export default async function AdminPeerReviewPage({ searchParams }: PageProps) {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  const params = searchParams ? await searchParams : {};
  const period = isPeriod(params.period) ? params.period : formatWorkDate().slice(0, 7);

  const [staff, reviews, cells] = await Promise.all([
    listStaff(),
    fetchPeerReviews(period).catch(() => []),
    fetchMonthShiftCells(period).catch(() => [])
  ]);
  const nameOf = (code: string) => staff.find((entry) => entry.code === code)?.name || code;
  const roster = staff.filter((entry) => entry.onRoster && entry.code);

  const rows = roster
    .map((entry) => {
      const expected = coworkersOf(entry.code, period, cells).filter((code) => roster.some((r) => r.code === code));
      const given = reviews.filter((record) => record.raterCode === entry.code).length;
      return { entry, score: scorePeerReviews(reviews, entry.code), expected: expected.length, given };
    })
    .sort((a, b) => (b.score.score ?? -1) - (a.score.score ?? -1));

  const selected = params.staff ? rows.find((row) => row.entry.code === params.staff) : undefined;
  const received = selected ? reviews.filter((record) => record.rateeCode === selected.entry.code) : [];

  return (
    <main className="page skill-review peer-review">
      <Link href="/admin" className="back-link">← กลับหน้าแอดมิน</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">KPI ใหม่ · ค2 · เห็นเฉพาะแอดมิน</p>
          <h2>ผลประเมิน 360 รายเดือน</h2>
          <p>
            คะแนน 360 = ค่าเฉลี่ยทุกข้อจากทุกคนที่ประเมิน (ทุกครั้ง 100 · ส่วนใหญ่ 67 · บางครั้ง 33 · ไม่เห็นเลย 0)
            · พนักงานประเมินได้ที่หน้า <Link href="/peer-review">/peer-review</Link> · ยังไม่ผูกคะแนนเดิมหรือเงินเดือน
          </p>
        </div>
        <form className="owner-ops__date">
          <label>
            เดือน
            <input type="month" name="period" defaultValue={period} />
          </label>
          <button type="submit">ดู</button>
        </form>
      </section>

      <p className="skill-review__week">
        รอบ {thaiMonth(period)} · รวม {reviews.length} แบบ
        {cells.length === 0 ? " · ยังไม่มีตารางกะของเดือนนี้ (นับคนที่ต้องประเมินไม่ได้)" : ""}
      </p>

      <section className="owner-ops__panel">
        <div className="peer-review__table" role="table" aria-label="ผล 360 รายคน">
          <div role="row" className="peer-review__tr is-head">
            <span role="columnheader">พนักงาน</span>
            <span role="columnheader">คะแนน</span>
            <span role="columnheader">ถูกประเมิน</span>
            <span role="columnheader">ประเมินเพื่อนแล้ว</span>
          </div>
          {rows.map((row) => (
            <Link
              key={row.entry.code}
              role="row"
              href={`/admin/peer-review?period=${period}&staff=${encodeURIComponent(row.entry.code)}#detail`}
              className={`peer-review__tr${row.entry.code === params.staff ? " is-active" : ""}`}
            >
              <span role="cell">{row.entry.name || row.entry.code}</span>
              <span role="cell">
                <strong>{row.score.score ?? "–"}</strong>
              </span>
              <span role="cell">{row.score.raters} คน</span>
              <span role="cell" className={row.expected && row.given < row.expected ? "peer-review__todo" : undefined}>
                {row.given}/{row.expected}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {selected ? (
        <section className="owner-ops__panel" id="detail">
          <div className="section-heading">
            <p className="eyebrow">{thaiMonth(period)}</p>
            <h3>
              {selected.entry.name || selected.entry.code} · {selected.score.score ?? "–"}
            </h3>
          </div>
          <ul className="peer-review__mine">
            {peerReviewItems.map((item) => (
              <li key={item.id}>
                <span>{item.text}</span>
                <strong>{selected.score.byItem[item.id] ?? "–"}</strong>
              </li>
            ))}
          </ul>
          {received.length === 0 ? <p className="owner-ops__empty">ยังไม่มีใครประเมินคนนี้ในเดือนนี้</p> : null}
          {received.map((record) => (
            <div key={record.id} className="skill-review__row">
              <div className="skill-review__head">
                <strong>จาก {staff.some((entry) => entry.code === record.raterCode) ? nameOf(record.raterCode) : record.raterName || record.raterEmail}</strong>
                <small className="skill-review__meta">{record.updatedAt.slice(0, 10)}</small>
              </div>
              <ul className="peer-review__given">
                {peerReviewItems.map((item, index) => (
                  <li key={item.id}>
                    <span>
                      {index + 1}. {ratingLabel(record.ratings[item.id])}
                    </span>
                    {record.examples[item.id] ? <em>“{record.examples[item.id]}”</em> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}
    </main>
  );
}
