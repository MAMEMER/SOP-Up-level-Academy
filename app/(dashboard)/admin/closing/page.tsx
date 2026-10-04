import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleAlert, CircleCheck, Clock } from "lucide-react";
import { AdminBranchSwitch } from "../../../../components/AdminBranchSwitch.tsx";
import { DailyCloseForm } from "../../../../components/DailyCloseForm.tsx";
import { KshopBankTotalInput } from "../../../../components/KshopBankTotalInput.tsx";
import { branchesForView, resolveAdminBranchView } from "../../../../lib/admin-branch.ts";
import { requireUser } from "../../../../lib/auth.ts";
import { SATANG_BUCKET_LABEL, addDays, bangkokTimeOf, type SatangBucket } from "../../../../lib/daily-close.ts";
import { getOwnerDay } from "../../../../lib/daily-close-server.ts";
import { branchColor, branchShortName } from "../../../../lib/store-config.ts";
import { formatWorkDate } from "../../../../lib/workflow-records.ts";

export const dynamic = "force-dynamic";

const baht = (value: number) => value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isDate = (value: string | undefined): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

type PageProps = { searchParams?: Promise<{ date?: string; branch?: string; edit?: string }> };

// เจ้าของร้าน: ปิดยอดสองสาขาคู่กัน + ยอด K SHOP รวมเทียบยอดที่ธนาคารสรุป
export default async function AdminClosingPage({ searchParams }: PageProps) {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  const params = searchParams ? await searchParams : {};
  const workDate = isDate(params.date) ? params.date : formatWorkDate();
  const view = await resolveAdminBranchView(params.branch);
  const shown = branchesForView(view);
  const day = await getOwnerDay(workDate);
  const kshop = day.kshop;
  const allClosed = day.branches.every((entry) => entry.close);
  const cashDiff = day.branches.reduce((sum, entry) => sum + (entry.close?.result.diff ?? 0), 0);

  return (
    <main className="page">
      <Link href="/admin" className="back-link">← กลับ หน้ารวมงานจัดการ</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">ปิดยอด 2 สาขา</p>
          <h2>ปิดยอด {workDate}</h2>
          <p>
            แต่ละสาขาปิดเงินสดของตัวเอง · K SHOP ใช้บัญชีเดียว แยกด้วยเศษสตางค์: .00 บางแค · .80–.99 หน้าร้านเสนาฯ · .01–.79 ออนไลน์ (ลงเครื่องเสนาฯ)
          </p>
        </div>
        <form className="owner-ops__date">
          <label>
            วันที่
            <input type="date" name="date" defaultValue={workDate} />
          </label>
          <input type="hidden" name="branch" value={view} />
          <button type="submit">ดู</button>
        </form>
      </section>

      <div className="admin-branch-bar">
        <AdminBranchSwitch value={view} allowAll />
        <Link className="soft-button" href={`/admin/closing?date=${addDays(workDate, -1)}`}>วันก่อน</Link>
        <Link className="soft-button" href={`/admin/closing?date=${addDays(workDate, 1)}`}>วันถัดไป</Link>
      </div>

      {/* สรุปบนสุด: ปิดครบไหม · เงินสดตรงไหม · K SHOP ตรงไหม */}
      <section className="close-verdict">
        <div className={allClosed ? "is-ok" : "is-wait"}>
          {allClosed ? <CircleCheck size={20} aria-hidden /> : <Clock size={20} aria-hidden />}
          <span>{allClosed ? "ปิดครบสองสาขาแล้ว" : `ยังไม่ปิด: ${day.branches.filter((b) => !b.close).map((b) => branchShortName(b.branch)).join(", ")}`}</span>
        </div>
        <div className={cashDiff !== 0 ? "is-bad" : allClosed ? "is-ok" : "is-wait"}>
          {allClosed && cashDiff === 0 ? <CircleCheck size={20} aria-hidden /> : cashDiff === 0 ? <Clock size={20} aria-hidden /> : <CircleAlert size={20} aria-hidden />}
          <span>
            {!allClosed && cashDiff === 0
              ? "เงินสด รอปิดครบทุกสาขา"
              : `เงินสดรวม ${cashDiff === 0 ? "ตรง" : `${cashDiff > 0 ? "เกิน" : "ขาด"} ${baht(Math.abs(cashDiff))}`}`}
          </span>
        </div>
        <div className={kshop?.diff === null || kshop?.diff === undefined ? "is-wait" : kshop.diff === 0 ? "is-ok" : "is-bad"}>
          {kshop?.diff === 0 ? <CircleCheck size={20} aria-hidden /> : <CircleAlert size={20} aria-hidden />}
          <span>
            K SHOP{" "}
            {kshop?.diff === null || kshop?.diff === undefined
              ? "รอยอดธนาคาร"
              : kshop.diff === 0
                ? "ตรงกับธนาคาร"
                : `ธนาคาร${kshop.diff > 0 ? "มากกว่า" : "น้อยกว่า"} POS ${baht(Math.abs(kshop.diff))}`}
          </span>
        </div>
      </section>

      <div className={shown.length > 1 ? "admin-branch-cols" : undefined}>
        {day.branches
          .filter((entry) => shown.includes(entry.branch))
          .map((entry) => (
            <section key={entry.branch} className="admin-branch-col" style={{ ["--branch-color" as string]: branchColor(entry.branch) }}>
              <h3><i aria-hidden />{branchShortName(entry.branch)}</h3>
              {entry.close ? (
                <dl className="close-lines">
                  <div><dt>ขายเงินสด (POS)</dt><dd>{baht(entry.close.posCash)}</dd></div>
                  <div><dt>เงินทอนตั้งต้น</dt><dd>{baht(entry.close.cash.openingFloat)}</dd></div>
                  <div><dt>จ่ายออก</dt><dd>{baht(entry.close.result.paidOutTotal)}</dd></div>
                  <div><dt>ควรมีในลิ้นชัก</dt><dd>{baht(entry.close.result.expected)}</dd></div>
                  <div><dt>นับได้</dt><dd>{baht(entry.close.result.counted)}</dd></div>
                  <div className={`close-lines__total ${entry.close.result.diff === 0 ? "is-ok" : "is-bad"}`}>
                    <dt>{entry.close.result.diff === 0 ? "เงินสดตรง" : entry.close.result.diff > 0 ? "เงินสดเกิน" : "เงินสดขาด"}</dt>
                    <dd>{baht(entry.close.result.diff)}</dd>
                  </div>
                  <div><dt>นำส่ง</dt><dd>{baht(entry.close.result.handover)}</dd></div>
                  <div><dt>เก็บเงินทอนไว้</dt><dd>{baht(entry.close.cash.floatKept)}</dd></div>
                </dl>
              ) : (
                <p className="close-meta">ยังไม่ได้ปิดยอด</p>
              )}
              {entry.close?.cash.paidOuts.length ? (
                <ul className="close-list">
                  {entry.close.cash.paidOuts.map((item, index) => (
                    <li key={index}>จ่ายออก {baht(item.amount)} — {item.note}</li>
                  ))}
                </ul>
              ) : null}
              {entry.close?.note ? <p className="close-meta">หมายเหตุ: {entry.close.note}</p> : null}
              {entry.close ? (
                <p className="close-meta">
                  ปิดโดย {entry.close.closedByName || entry.close.closedBy} ·{" "}
                  {new Date(entry.close.closedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}
                  {entry.close.history?.length ? ` · ปิดซ้ำ ${entry.close.history.length} ครั้ง (ประวัติเก็บไว้)` : ""}
                </p>
              ) : null}
              {entry.pos ? (
                <dl className="close-lines close-lines--sub">
                  {Object.entries(entry.pos.byMethod).map(([method, amount]) => (
                    <div key={method}><dt>POS · {method === "Cash" ? "เงินสด" : method}</dt><dd>{baht(amount)}</dd></div>
                  ))}
                  <div><dt>POS รวม {entry.pos.bills} บิล</dt><dd>{baht(entry.pos.total)}</dd></div>
                </dl>
              ) : (
                <p className="close-alert"><CircleAlert size={18} aria-hidden /> {entry.posError}</p>
              )}
              {entry.ruleIssues.length ? (
                <div className="close-alert">
                  <CircleAlert size={18} aria-hidden />
                  <div>
                    <strong>เศษสตางค์ผิดกติกา {entry.ruleIssues.length} บิล</strong>
                    <ul>
                      {entry.ruleIssues.map((issue) => (
                        <li key={`${issue.invoiceNumber}-${issue.time}-${issue.amount}`}>{issue.time} · {baht(issue.amount)} — {issue.message}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}
              {params.edit === entry.branch ? (
                <DailyCloseForm initial={entry} branchName={branchShortName(entry.branch)} readOnly={user.isImpersonating} />
              ) : (
                <Link className="soft-button" href={`/admin/closing?date=${workDate}&branch=${view}&edit=${entry.branch}`}>
                  {entry.close ? "แก้/ปิดยอดใหม่แทนสาขา" : "ปิดยอดแทนสาขา"}
                </Link>
              )}
            </section>
          ))}
      </div>

      <section className="close-card close-kshop">
        <div className="close-card__head">
          <h3>K SHOP รวมสองสาขา (รอบธนาคาร 23:00 เมื่อวาน – 23:00 วันนี้)</h3>
        </div>
        {kshop ? (
          <>
            <dl className="close-lines">
              {(["whole", "store", "online"] as SatangBucket[]).map((bucket) => (
                <div key={bucket}><dt>{SATANG_BUCKET_LABEL[bucket]}</dt><dd>{baht(kshop.byBucket[bucket])}</dd></div>
              ))}
              <div className="close-lines__total"><dt>POS สองเครื่องรวม</dt><dd>{baht(kshop.posTotal)}</dd></div>
              <div><dt>ธนาคารสรุป</dt><dd>{kshop.bankTotal === null ? "—" : baht(kshop.bankTotal)}</dd></div>
              {kshop.diff !== null ? (
                <div className={`close-lines__total ${kshop.diff === 0 ? "is-ok" : "is-bad"}`}>
                  <dt>ต่าง (ธนาคาร − POS)</dt><dd>{baht(kshop.diff)}</dd>
                </div>
              ) : null}
            </dl>
            <KshopBankTotalInput workDate={workDate} initial={day.bank?.amount ?? null} />
            <p className="close-meta">
              ยอดธนาคารมาจากเมล &quot;เรียน ร้านค้า K SHOP Up Level Academy&quot; ที่ส่งเช้าวันถัดไป ·{" "}
              <a href="https://mail.google.com/mail/u/0/#search/from%3AKPLUSSHOP%40kasikornbank.com" target="_blank" rel="noreferrer">เปิดเมล</a>
            </p>
            {kshop.moneyInWithoutBill.length ? (
              <div className="close-alert">
                <CircleAlert size={18} aria-hidden />
                <div>
                  <strong>เงินเข้า K SHOP แต่ไม่พบบิลยอดเดียวกันในเครื่องไหนเลย {kshop.moneyInWithoutBill.length} รายการ</strong>
                  <ul>
                    {kshop.moneyInWithoutBill.map((item, index) => (
                      <li key={index}>{bangkokTimeOf(item.at)} · {baht(item.amount)}{item.payer ? ` · ${item.payer}` : ""}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
            {kshop.billsWithoutMoneyIn.length ? (
              <details className="close-details">
                <summary>บิล K SHOP ที่ยังไม่เห็นโนติเงินเข้า {kshop.billsWithoutMoneyIn.length} บิล (โนติจากมือถือร้านตกหล่นได้ — ใช้เป็นเบาะแสตอนยอดไม่ตรง)</summary>
                <ul className="close-list">
                  {kshop.billsWithoutMoneyIn.map((bill) => (
                    <li key={bill.refId}>{bill.time} · {branchShortName(bill.branch)} · {baht(bill.amount)}</li>
                  ))}
                </ul>
              </details>
            ) : null}
            <p className="close-meta">โนติเงินเข้าจากมือถือร้านรอบนี้ {day.moneyInCount} รายการ</p>
          </>
        ) : (
          <p className="close-alert"><CircleAlert size={18} aria-hidden /> {day.kshopError}</p>
        )}
      </section>
    </main>
  );
}
