import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../../../lib/auth.ts";
import { employeeCodeForEmail } from "../../../lib/employee-directory.ts";
import { branchShortName } from "../../../lib/store-config.ts";
import { formatWorkDate } from "../../../lib/workflow-records.ts";
import { fetchMistake, fetchMistakes, saveMistake } from "../../../lib/kpi-v2-store.ts";
import {
  appealDeadline,
  canAppeal,
  deductionFor,
  isVoided,
  levelLabel,
  monthlyGroupScores,
  occurrenceOf,
  taskByCode
} from "../../../lib/mistake-log.ts";

// บันทึกความผิดของฉัน (KPI ใหม่ ค1) — พนักงานเห็นบันทึกของตัวเองทุกรายการ และโต้แย้งได้ภายใน 3 วันหลังบันทึก.

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<{ status?: string }> };

const statusMessages: Record<string, { tone: "success" | "warning"; text: string }> = {
  appealed: { tone: "success", text: "ส่งคำโต้แย้งแล้ว ผู้บริหารจะตัดสินให้" },
  late: { tone: "warning", text: "เลยกำหนดโต้แย้ง 3 วันแล้ว หรือโต้แย้งไปแล้ว" },
  empty: { tone: "warning", text: "เขียนเหตุผลที่โต้แย้งก่อนส่ง" },
  denied: { tone: "warning", text: "ไม่มีสิทธิ์โต้แย้งรายการนี้" },
  error: { tone: "warning", text: "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง" }
};

function thaiDate(date: string) {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

function back(status: string): never {
  redirect(`/mistakes?status=${status}`);
}

async function appealAction(formData: FormData) {
  "use server";
  const user = await requireUser();
  const staffCode = employeeCodeForEmail(user.email);
  if (user.isImpersonating || !staffCode) back("denied");
  const text = String(formData.get("text") || "").trim().slice(0, 1000);
  if (!text) back("empty");
  const record = await fetchMistake(String(formData.get("id") || ""));
  if (!record || record.staffCode !== staffCode) back("denied");
  const now = new Date().toISOString();
  if (!canAppeal(record, now)) back("late");
  try {
    await saveMistake({ ...record, appeal: { text, at: now } });
  } catch {
    back("error");
  }
  revalidatePath("/mistakes");
  back("appealed");
}

export default async function MyMistakesPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const params = searchParams ? await searchParams : {};
  const staffCode = employeeCodeForEmail(user.email);
  const period = formatWorkDate().slice(0, 7);
  const records = staffCode ? await fetchMistakes(staffCode).catch(() => []) : [];
  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const scores = staffCode ? monthlyGroupScores(records, staffCode, period) : [];
  const now = new Date().toISOString();
  const status = params.status ? statusMessages[params.status] : undefined;

  return (
    <main className="page skill-review mistake-log">
      <Link href="/" className="back-link">← กลับหน้าหลัก</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">KPI งานพื้นฐาน</p>
          <h2>บันทึกความผิดของฉัน</h2>
          <p>
            ทุกครั้งที่ผู้จัดการหรือผู้บริหารบันทึก จะขึ้นที่นี่พร้อมรหัสงาน · ถ้าไม่ตรงกับที่เกิดขึ้นจริง
            โต้แย้งได้ภายใน 3 วัน · ผิดครั้งแรกแบบไม่ตั้งใจไม่หักคะแนน ใช้เพื่อสอนงาน
          </p>
        </div>
      </section>

      {status ? <p className={`input-status ${status.tone}`}>{status.text}</p> : null}

      {staffCode ? (
        <section className="owner-ops__panel">
          <div className="section-heading">
            <p className="eyebrow">เดือนนี้</p>
            <h3>คะแนนงานพื้นฐาน</h3>
          </div>
          <ul className="peer-review__mine">
            {scores.map((score) => (
              <li key={score.group}>
                <span>{score.group === "1.1" ? "1.1 หน้าร้าน พื้นฐาน" : "2.1 หลังร้าน พื้นฐาน"}</span>
                <strong>{score.score}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="owner-ops__panel">
          <p className="owner-ops__empty">บัญชีนี้ยังไม่มีรหัสพนักงาน</p>
        </section>
      )}

      {staffCode ? (
        <section className="owner-ops__panel">
          <div className="section-heading">
            <p className="eyebrow">ทั้งหมด</p>
            <h3>{sorted.length ? `${sorted.length} รายการ` : "ยังไม่มีบันทึก"}</h3>
          </div>
          {sorted.map((record) => {
            const deduction = deductionFor(record, records);
            return (
              <div key={record.id} className={`skill-review__row${isVoided(record) ? " mistake-log__voided" : ""}`}>
                <div className="skill-review__head">
                  <strong>
                    {record.taskCode} {taskByCode(record.taskCode)?.name}
                  </strong>
                  <span className="skill-review__level">
                    {isVoided(record) ? "ยกเลิกแล้ว" : deduction === null ? "กลุ่มเหลือ 0" : deduction === 0 ? "ไม่หัก" : `หัก ${deduction}`}
                  </span>
                </div>
                <small className="skill-review__meta">
                  {thaiDate(record.date)} · {branchShortName(record.branch)} · {levelLabel(record.level)} ครั้งที่{" "}
                  {occurrenceOf(record, records)} ใน 3 เดือน
                </small>
                <p className="skill-review__criteria">{record.note}</p>
                {record.appeal ? (
                  <small className="skill-review__meta">
                    โต้แย้งแล้ว: {record.appeal.text}
                    {record.decision
                      ? ` · ผล: ${record.decision.result === "voided" ? "ยกเลิกบันทึก" : "คงบันทึกไว้"}${record.decision.note ? ` (${record.decision.note})` : ""}`
                      : " · รอผู้บริหารตัดสิน"}
                  </small>
                ) : canAppeal(record, now) ? (
                  <form action={appealAction} className="skill-review__inline">
                    <input type="hidden" name="id" value={record.id} />
                    <input name="text" required maxLength={1000} placeholder="ไม่ตรงอย่างไร" className="mistake-log__reason" />
                    <button type="submit">โต้แย้ง (ถึง {thaiDate(appealDeadline(record))})</button>
                  </form>
                ) : null}
              </div>
            );
          })}
        </section>
      ) : null}
    </main>
  );
}
