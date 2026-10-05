import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth.ts";
import { isOwner } from "../../../../lib/owner.ts";
import { getLineBotReport, type LineBotReport } from "../../../../lib/line-bot-report-server.ts";
import { LINE_BOT_LAUNCH_DATE, formatDuration, personLabel, recentLineBotLog, resolveLineBotPerson, truncate } from "../../../../lib/line-bot-report.ts";

// ผู้ช่วยไลน์ (บอท Golden Baby) — บอทตอบคำถามพนักงานกี่ครั้ง เร็วแค่ไหน เตือนเดดไลน์แล้วส่งทันไหม
// อ่านจาก log ที่บอทเขียนลง Firestore (line_bot_qa / line_bot_nudges) เท่านั้น

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<{ days?: string; who?: string }> };

const PERIODS = [7, 30] as const;

function thaiDate(date: string): string {
  return new Date(`${date}T12:00:00+07:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });
}

function thaiTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "–";
  return new Date(ms).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
}

function percent(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : "–";
}

function href(days: number, who?: string | null): string {
  const params = new URLSearchParams({ days: String(days) });
  if (who) params.set("who", who);
  return `/admin/line-bot?${params.toString()}`;
}

export default async function LineBotPage({ searchParams }: PageProps) {
  const user = await requireUser();
  if (!isOwner(user.actualEmail)) redirect("/admin");
  const params = (await searchParams) || {};
  const days = PERIODS.find((value) => String(value) === params.days) ?? 7;
  const who = params.who?.trim() || null;

  let report: LineBotReport | null = null;
  let error = "";
  try {
    report = await getLineBotReport(days);
  } catch (err) {
    error = err instanceof Error ? err.message : "โหลดข้อมูลไม่ได้";
  }

  const log = report ? recentLineBotLog(report.qa, report.staff, who) : [];
  const askers = report ? report.staffRows.filter((row) => row.questions > 0) : [];

  return (
    <main className="page sdoc-page">
      <Link href="/admin" className="back-link">← ศูนย์รวมงานจัดการ</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">ผู้ช่วยไลน์ · เฉพาะเจ้าของ</p>
          <h2>บอทตอบคำถาม + เตือนงาน</h2>
          <p>พนักงานถามอะไรบอทบ้าง ตอบเร็วแค่ไหน และหลังโดนเตือนแล้วส่งเช็คลิสต์ทันไหม · บอทเริ่มใช้ {thaiDate(LINE_BOT_LAUNCH_DATE)}</p>
        </div>
      </section>

      <nav className="stock-loss-tabs" aria-label="ช่วงเวลา">
        {PERIODS.map((value) => (
          <Link
            key={value}
            href={href(value, who)}
            className={value === days ? "is-active" : undefined}
            aria-current={value === days ? "page" : undefined}
          >
            {value} วันล่าสุด
          </Link>
        ))}
      </nav>

      {error ? (
        <section className="sdoc-section">
          <p className="sdoc-error">{error}</p>
        </section>
      ) : report ? (
        <>
          <section className="sdoc-section">
            <p className="eyebrow">
              {thaiDate(report.windows.from)} – {thaiDate(report.windows.to)} · {days} วัน
            </p>
            <div className="flower-target-stats line-bot-stats">
              <div><small>ตอบคำถามแล้ว</small><strong>{report.summary.answered}</strong></div>
              <div><small>เวลาตอบ (ค่ากลาง)</small><strong>{formatDuration(report.summary.medianResponseSec)}</strong></div>
              <div><small>ตอบไม่ได้ / ล้มเหลว</small><strong className={report.summary.failed ? "line-bot-warn" : undefined}>{report.summary.failed}</strong></div>
              <div><small>ส่งต่อให้เจ้าของ</small><strong>{report.summary.relayed}</strong></div>
              <div><small>ข้อความเตือนที่ส่ง</small><strong>{report.summary.nudges}</strong></div>
            </div>
            {!report.summary.questions && !report.summary.nudges ? (
              <p className="sdoc-help">ช่วงนี้ยังไม่มีใครถามบอท และบอทยังไม่ได้ส่งเตือน — ข้อมูลจะขึ้นเองเมื่อบอทเริ่มทำงาน</p>
            ) : null}
          </section>

          <section className="sdoc-section">
            <p className="eyebrow">รายคน</p>
            {report.staffRows.length ? (
              <ul className="line-bot-people">
                {report.staffRows.map((row) => (
                  <li key={row.key}>
                    <span className="line-bot-name">{row.label}</span>
                    <dl className="line-bot-figures">
                      <div><dt>ถามบอท</dt><dd>{row.questions}</dd></div>
                      <div><dt>โดนเตือน</dt><dd>{row.nudges}</dd></div>
                      <div>
                        <dt>ส่งทันหลังโดนเตือน</dt>
                        <dd>
                          {row.soonNudgesDue ? `${row.soonNudgesOnTime}/${row.soonNudgesDue}` : "–"}
                          {row.soonNudgesDue ? <small> {percent(row.soonNudgesOnTime, row.soonNudgesDue)}</small> : null}
                        </dd>
                      </div>
                      <div>
                        <dt>เช็คลิสต์ส่งช้า ก่อน → หลัง</dt>
                        <dd className={row.lateAfter < row.lateBefore ? "line-bot-better" : row.lateAfter > row.lateBefore ? "line-bot-warn" : undefined}>
                          {row.lateBefore} → {report.windows.afterDays ? row.lateAfter : "–"}
                        </dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sdoc-hint">ยังไม่มีรายชื่อพนักงาน</p>
            )}
            <p className="sdoc-hint">
              ส่งทันหลังโดนเตือน = เตือน &ldquo;ใกล้ถึงเวลาเช็คลิสต์&rdquo; แล้วหัวข้อนั้นส่งทันเดดไลน์ (ไม่นับอันที่ยังไม่ถึงเวลา) ·
              เช็คลิสต์ส่งช้า = จำนวนหัวข้อที่ส่งเกินเวลา (แต้มที่ KPI หัก) เทียบ{" "}
              {report.windows.afterDays
                ? `${report.windows.afterDays} วันก่อนมีบอท (${thaiDate(report.windows.beforeFrom)} – ${thaiDate(report.windows.beforeTo)}) กับ ${report.windows.afterDays} วันหลังมีบอท (${thaiDate(report.windows.afterFrom)} – ${thaiDate(report.windows.to)})`
                : "ก่อน / หลังมีบอท"}{" "}
              — ใช้ดูแนวโน้มเท่านั้น ไม่ใช่ยอดหักเงินเดือนจริง
            </p>
          </section>

          <section className="sdoc-section">
            <p className="eyebrow">บทสนทนาล่าสุด</p>
            {askers.length ? (
              <nav className="stock-loss-tabs" aria-label="กรองตามคน">
                <Link href={href(days)} className={!who ? "is-active" : undefined} aria-current={!who ? "page" : undefined}>ทุกคน</Link>
                {askers.map((row) => (
                  <Link
                    key={row.key}
                    href={href(days, row.key)}
                    className={who === row.key ? "is-active" : undefined}
                    aria-current={who === row.key ? "page" : undefined}
                  >
                    {row.label}
                  </Link>
                ))}
              </nav>
            ) : null}
            {log.length ? (
              <ul className="line-bot-log">
                {log.map((entry) => {
                  const failed = entry.status !== "answered";
                  return (
                    <li key={entry.id}>
                      <div className="line-bot-log-head">
                        <strong>{personLabel(resolveLineBotPerson(entry.staffCode, entry.who, report.staff), report.staff)}</strong>
                        <small>{thaiTime(entry.receivedAt)}{entry.responseSec !== null ? ` · ตอบใน ${formatDuration(entry.responseSec)}` : ""}</small>
                      </div>
                      <p className="line-bot-question">{truncate(entry.text || (entry.photo ? "(ส่งรูป)" : "(ไม่มีข้อความ)"), 140)}</p>
                      <div className="line-bot-badges">
                        {entry.photo ? <span className="parcel-order__pill">มีรูป</span> : null}
                        {entry.inGroup ? <span className="parcel-order__pill">ในกลุ่ม</span> : null}
                        {entry.relayedToOwner ? <span className="parcel-order__pill parcel-order__pill--arrived">ส่งต่อเจ้าของ</span> : null}
                        {failed ? <span className="parcel-order__pill parcel-order__pill--late">ตอบไม่ได้</span> : null}
                      </div>
                      {entry.answer ? (
                        <details className="line-bot-answer">
                          <summary>ดูคำตอบบอท</summary>
                          <p>{entry.answer}</p>
                        </details>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="sdoc-hint">{who ? "คนนี้ยังไม่ได้ถามบอทในช่วงนี้" : "ยังไม่มีบทสนทนาในช่วงนี้"}</p>
            )}
            {log.length >= 100 ? <p className="sdoc-hint">แสดง 100 ข้อความล่าสุด</p> : null}
          </section>
        </>
      ) : null}
    </main>
  );
}
