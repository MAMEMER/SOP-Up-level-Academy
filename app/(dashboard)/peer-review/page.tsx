import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../../../lib/auth.ts";
import { PeerReviewForm } from "../../../components/PeerReviewForm.tsx";
import { employeeCodeForEmail } from "../../../lib/employee-directory.ts";
import { listStaff } from "../../../lib/staff-store.ts";
import { formatWorkDate } from "../../../lib/workflow-records.ts";
import { fetchMonthShiftCells, fetchPeerReviews, savePeerReview } from "../../../lib/kpi-v2-store.ts";
import {
  MIN_RATERS_TO_SHOW,
  coworkersOf,
  isPeriod,
  openPeriods,
  peerReviewId,
  peerReviewItems,
  previousPeriod,
  scorePeerReviews,
  validatePeerReview,
  type PeerReviewRecord,
  type Rating
} from "../../../lib/peer-review.ts";

// ประเมิน 360 รายเดือน (KPI ใหม่ ค2) — พนักงานประเมินเพื่อนที่ทำกะเดียวกันในเดือนนั้น.
// ผู้ถูกประเมินไม่เห็นว่าใครให้เท่าไร · เห็นแค่ค่าเฉลี่ยของตัวเองเมื่อมีคนประเมิน ≥ 2 คน.

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<{ period?: string; status?: string; who?: string }> };

const statusMessages: Record<string, { tone: "success" | "warning"; text: string }> = {
  saved: { tone: "success", text: "บันทึกแล้ว แก้ได้จนกว่าจะปิดรอบ" },
  closed: { tone: "warning", text: "รอบนี้ปิดแล้ว ประเมินได้เฉพาะเดือนนี้ (และเดือนที่แล้วถึงวันที่ 7)" },
  not_coworker: { tone: "warning", text: "ประเมินได้เฉพาะคนที่ทำกะเดียวกันในเดือนนั้น" },
  denied: { tone: "warning", text: "บัญชีนี้ประเมินไม่ได้ (โหมดดูแทนพนักงาน หรือไม่มีรหัสพนักงาน)" },
  error: { tone: "warning", text: "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง" }
};

function thaiMonth(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

function raterCodeFor(email: string): string {
  return employeeCodeForEmail(email) || `admin-${email.split("@")[0]}`;
}

async function allowedRatees(raterCode: string, isAdmin: boolean, period: string) {
  const staff = await listStaff();
  const roster = staff.filter((entry) => entry.onRoster && entry.code && entry.code !== raterCode);
  if (isAdmin) return roster;
  const cells = await fetchMonthShiftCells(period).catch(() => []);
  const coworkers = new Set(coworkersOf(raterCode, period, cells));
  return roster.filter((entry) => coworkers.has(entry.code));
}

function back(period: string, status: string, who?: string): never {
  const params = new URLSearchParams({ period, status });
  if (who) params.set("who", who);
  redirect(`/peer-review?${params.toString()}${who ? `#p-${who}` : ""}`);
}

async function savePeerAction(formData: FormData) {
  "use server";
  const period = String(formData.get("period") || "");
  const ratee = String(formData.get("ratee") || "");
  const user = await requireUser();
  if (user.isImpersonating) back(period, "denied");
  if (!isPeriod(period) || !openPeriods(formatWorkDate()).includes(period)) back(period, "closed");

  const raterCode = raterCodeFor(user.email);
  const isAdmin = user.role === "admin";
  if (!isAdmin && !employeeCodeForEmail(user.email)) back(period, "denied");
  const allowed = await allowedRatees(raterCode, isAdmin, period);
  if (!allowed.some((entry) => entry.code === ratee)) back(period, "not_coworker");

  const ratings: Record<string, number> = {};
  const examples: Record<string, string> = {};
  for (const item of peerReviewItems) {
    ratings[item.id] = Number(formData.get(`r_${item.id}`) || 0);
    const example = String(formData.get(`e_${item.id}`) || "").trim().slice(0, 300);
    if (example) examples[item.id] = example;
  }
  const invalid = validatePeerReview({ ratings, examples });
  if (invalid) {
    const params = new URLSearchParams({ period, who: ratee, err: invalid });
    redirect(`/peer-review?${params.toString()}#p-${ratee}`);
  }

  const now = new Date().toISOString();
  const id = peerReviewId(period, raterCode, ratee);
  try {
    const existing = (await fetchPeerReviews(period)).find((record) => record.id === id);
    const record: PeerReviewRecord = {
      id,
      period,
      raterCode,
      raterEmail: user.actualEmail,
      ...(user.actualName ? { raterName: user.actualName } : {}),
      rateeCode: ratee,
      ratings: ratings as Record<string, Rating>,
      examples,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    await savePeerReview(record);
  } catch {
    back(period, "error", ratee);
  }
  revalidatePath("/peer-review");
  back(period, "saved", ratee);
}

export default async function PeerReviewPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const params = (searchParams ? await searchParams : {}) as { period?: string; status?: string; who?: string; err?: string };
  const today = formatWorkDate();
  const open = openPeriods(today);
  const period = isPeriod(params.period) && open.includes(params.period) ? params.period : open[0];
  const raterCode = raterCodeFor(user.email);
  const isAdmin = user.role === "admin";
  const myCode = employeeCodeForEmail(user.email);

  const [ratees, periodReviews, lastReviews] = await Promise.all([
    allowedRatees(raterCode, isAdmin, period).catch(() => []),
    fetchPeerReviews(period).catch(() => []),
    myCode ? fetchPeerReviews(previousPeriod(today.slice(0, 7))).catch(() => []) : Promise.resolve([])
  ]);
  const mine = periodReviews.filter((record) => record.raterCode === raterCode);
  const done = new Set(mine.map((record) => record.rateeCode));
  const status = params.status ? statusMessages[params.status] : undefined;
  const myScore = myCode ? scorePeerReviews(lastReviews, myCode) : null;
  const lastPeriod = previousPeriod(today.slice(0, 7));

  return (
    <main className="page skill-review peer-review">
      <Link href="/" className="back-link">← กลับหน้าหลัก</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">KPI ทีมเวิร์ก · ประเมินทุกเดือน</p>
          <h2>ประเมินเพื่อนร่วมกะ (360)</h2>
          <p>
            ประเมินทุกคนที่ทำกะเดียวกับเราในเดือนนั้น 6 ข้อ · เลือกตามที่เห็นจริง · ให้ &quot;ทุกครั้ง&quot; หรือ
            &quot;ไม่เห็นเลย&quot; ต้องเขียนตัวอย่างหนึ่งประโยค · <strong>คนที่ถูกประเมินไม่เห็นว่าใครให้เท่าไร</strong>
          </p>
        </div>
        {open.length > 1 ? (
          <form className="owner-ops__date">
            <label>
              เดือนที่ประเมิน
              <select name="period" defaultValue={period}>
                {open.map((value) => (
                  <option key={value} value={value}>
                    {thaiMonth(value)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">ดู</button>
          </form>
        ) : null}
      </section>

      <p className="skill-review__week">
        รอบ {thaiMonth(period)} · ประเมินแล้ว {mine.length}/{ratees.length} คน
      </p>
      {status ? <p className={`input-status ${status.tone}`}>{status.text}</p> : null}
      {params.err ? <p className="input-status warning">{params.err}</p> : null}

      {myScore ? (
        <section className="owner-ops__panel">
          <div className="section-heading">
            <p className="eyebrow">ผลของฉัน · {thaiMonth(lastPeriod)}</p>
            <h3>{myScore.raters >= MIN_RATERS_TO_SHOW && myScore.score !== null ? `${myScore.score} / 100` : "ยังไม่มีผล"}</h3>
          </div>
          {myScore.raters >= MIN_RATERS_TO_SHOW ? (
            <ul className="peer-review__mine">
              {peerReviewItems.map((item) => (
                <li key={item.id}>
                  <span>{item.text}</span>
                  <strong>{myScore.byItem[item.id] ?? "–"}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="skill-review__days">ผลจะขึ้นเมื่อมีเพื่อนประเมินอย่างน้อย {MIN_RATERS_TO_SHOW} คน เพื่อไม่ให้เดาได้ว่าใครให้เท่าไร</p>
          )}
        </section>
      ) : null}

      {ratees.length === 0 ? (
        <section className="owner-ops__panel">
          <p className="owner-ops__empty">เดือนนี้ยังไม่มีเพื่อนที่ทำกะเดียวกันในตารางกะ</p>
        </section>
      ) : null}

      {ratees.map((entry) => {
        const existing = mine.find((record) => record.rateeCode === entry.code);
        return (
          <details key={entry.code} id={`p-${entry.code}`} className="owner-ops__panel peer-review__person" open={params.who === entry.code}>
            <summary>
              <strong>{entry.name || entry.code}</strong>
              <span className={done.has(entry.code) ? "peer-review__done" : "peer-review__todo"}>
                {done.has(entry.code) ? "ประเมินแล้ว · แก้ได้" : "ยังไม่ประเมิน"}
              </span>
            </summary>
            <PeerReviewForm
              action={savePeerAction}
              period={period}
              ratee={entry.code}
              rateeName={entry.name || entry.code}
              initial={existing ? { ratings: existing.ratings, examples: existing.examples } : undefined}
              saved={params.status === "saved" && params.who === entry.code}
            />
          </details>
        );
      })}
    </main>
  );
}
