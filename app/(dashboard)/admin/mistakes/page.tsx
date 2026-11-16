import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth.ts";
import { listStaff } from "../../../../lib/staff-store.ts";
import { branchConfigs, branchShortName } from "../../../../lib/store-config.ts";
import { formatWorkDate } from "../../../../lib/workflow-records.ts";
import { deleteMistake, fetchMistake, fetchMistakes, saveMistake } from "../../../../lib/kpi-v2-store.ts";
import {
  appealDeadline,
  canDecide,
  deductionFor,
  isVoided,
  levelLabel,
  mistakeLevels,
  monthlyGroupScores,
  occurrenceOf,
  sopTaskCodes,
  taskByCode,
  validateMistakeDraft,
  type AppealDecision,
  type MistakeLevel,
  type MistakeRecord
} from "../../../../lib/mistake-log.ts";

// บันทึกความผิดตาม SOP (KPI ใหม่ ค1) — ผู้จัดการ/ผู้บริหารบันทึก · พนักงานเห็นและโต้แย้งได้ใน 3 วันที่ /mistakes
// · คนตัดสินโต้แย้งต้องไม่ใช่คนบันทึก. แยกจาก performance-score เดิมทั้งหมด (ไม่หักคะแนน/เงินเดือนของระบบเก่า).

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<{ period?: string; staff?: string; status?: string; err?: string }> };

const statusMessages: Record<string, { tone: "success" | "warning"; text: string }> = {
  saved: { tone: "success", text: "บันทึกแล้ว พนักงานเห็นและโต้แย้งได้ภายใน 3 วัน" },
  decided: { tone: "success", text: "ตัดสินโต้แย้งแล้ว" },
  deleted: { tone: "success", text: "ลบบันทึกแล้ว" },
  self_decide: { tone: "warning", text: "คนบันทึกตัดสินเองไม่ได้ ต้องให้ผู้บริหารอีกท่านตัดสิน" },
  denied: { tone: "warning", text: "ไม่มีสิทธิ์ (ต้องเป็นแอดมิน และไม่ได้อยู่ในโหมดดูแทนพนักงาน)" },
  error: { tone: "warning", text: "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง" }
};

function thaiMonth(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

function thaiDate(date: string) {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

const str = (formData: FormData, key: string) => String(formData.get(key) || "").trim();

function back(status: string, extra: Record<string, string> = {}): never {
  const params = new URLSearchParams({ status, ...extra });
  redirect(`/admin/mistakes?${params.toString()}`);
}

async function requireWriter() {
  const user = await requireUser();
  if (user.role !== "admin" || user.isImpersonating) back("denied");
  return user;
}

async function createAction(formData: FormData) {
  "use server";
  const user = await requireWriter();
  const draft = {
    staffCode: str(formData, "staff"),
    date: str(formData, "date"),
    taskCode: str(formData, "task"),
    level: str(formData, "level"),
    note: str(formData, "note").slice(0, 1000)
  };
  const invalid = validateMistakeDraft(draft);
  if (invalid) back("form", { err: invalid });
  const now = new Date().toISOString();
  const record: MistakeRecord = {
    id: `mk__${now}__${draft.staffCode}`.replace(/[^a-zA-Z0-9_\-]/g, "-"),
    staffCode: draft.staffCode,
    branch: str(formData, "branch") || "bangkae",
    date: draft.date,
    taskCode: draft.taskCode,
    level: draft.level as MistakeLevel,
    note: draft.note,
    recordedBy: user.actualEmail,
    ...(user.actualName ? { recordedByName: user.actualName } : {}),
    createdAt: now
  };
  try {
    await saveMistake(record);
  } catch {
    back("error");
  }
  revalidatePath("/admin/mistakes");
  back("saved", { period: draft.date.slice(0, 7) });
}

async function decideAction(formData: FormData) {
  "use server";
  const user = await requireWriter();
  const id = str(formData, "id");
  const result = str(formData, "result") as AppealDecision;
  if (result !== "upheld" && result !== "voided") back("error");
  const record = await fetchMistake(id);
  if (!record) back("error");
  if (!canDecide(record, user.actualEmail)) back("self_decide");
  try {
    await saveMistake({
      ...record,
      decision: {
        result,
        by: user.actualEmail,
        ...(user.actualName ? { byName: user.actualName } : {}),
        at: new Date().toISOString(),
        ...(str(formData, "note") ? { note: str(formData, "note").slice(0, 500) } : {})
      }
    });
  } catch {
    back("error");
  }
  revalidatePath("/admin/mistakes");
  back("decided");
}

async function deleteAction(formData: FormData) {
  "use server";
  const user = await requireWriter();
  const record = await fetchMistake(str(formData, "id"));
  // ลบได้เฉพาะคนบันทึก และก่อนมีการโต้แย้ง/ตัดสิน — ไว้แก้บันทึกผิดคน/ผิดรหัส ไม่ใช่ลบหลักฐานทีหลัง
  if (!record || record.recordedBy !== user.actualEmail || record.appeal || record.decision) back("denied");
  try {
    await deleteMistake(record.id);
  } catch {
    back("error");
  }
  revalidatePath("/admin/mistakes");
  back("deleted");
}

export default async function AdminMistakesPage({ searchParams }: PageProps) {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  const params = searchParams ? await searchParams : {};
  const today = formatWorkDate();
  const period = params.period && /^\d{4}-\d{2}$/.test(params.period) ? params.period : today.slice(0, 7);

  const [staff, all] = await Promise.all([listStaff(), fetchMistakes().catch(() => [] as MistakeRecord[])]);
  const roster = staff.filter((entry) => entry.onRoster && entry.code);
  const nameOf = (code: string) => staff.find((entry) => entry.code === code)?.name || code;
  const filterStaff = params.staff && roster.some((entry) => entry.code === params.staff) ? params.staff : "";

  const pendingAppeals = all.filter((record) => record.appeal && !record.decision);
  const monthRecords = all
    .filter((record) => record.date.startsWith(period) && (!filterStaff || record.staffCode === filterStaff))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const status = params.status ? statusMessages[params.status] : undefined;

  return (
    <main className="page skill-review mistake-log">
      <Link href="/admin" className="back-link">← กลับหน้าแอดมิน</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">KPI ใหม่ · ค1 · งานพื้นฐาน 1.1 และ 2.1</p>
          <h2>บันทึกความผิดตาม SOP</h2>
          <p>
            แต่ละกลุ่มเริ่ม 100 ทุกเดือน · <strong>ไม่ตั้งใจ</strong> ครั้งที่ 1–6+ ในงานเดิมรอบ 3 เดือน หัก 0/3/6/12/24/30 ·{" "}
            <strong>ละเลย</strong> หัก 10/20/30 · <strong>จงใจ</strong> กลุ่มนั้นเหลือ 0 · ไม่คิดตามมูลค่าความเสียหาย ·
            พนักงานโต้แย้งได้ใน 3 วัน · ยังไม่ผูกคะแนนเดิมหรือเงินเดือน
          </p>
        </div>
        <form className="owner-ops__date">
          <label>
            เดือน
            <input type="month" name="period" defaultValue={period} />
          </label>
          <label>
            พนักงาน
            <select name="staff" defaultValue={filterStaff}>
              <option value="">ทุกคน</option>
              {roster.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.name || entry.code}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">ดู</button>
        </form>
      </section>

      {status ? <p className={`input-status ${status.tone}`}>{status.text}</p> : null}
      {params.err ? <p className="input-status warning">{params.err}</p> : null}

      <section className="owner-ops__panel">
        <div className="section-heading">
          <p className="eyebrow">บันทึกใหม่</p>
          <h3>เกิดอะไรขึ้น</h3>
        </div>
        <form action={createAction} className="skill-review__levels">
          <label>
            พนักงาน
            <select name="staff" required defaultValue={filterStaff}>
              <option value="">เลือก</option>
              {roster.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.name || entry.code}
                </option>
              ))}
            </select>
          </label>
          <label>
            วันที่เกิดเหตุ
            <input type="date" name="date" required defaultValue={today} max={today} />
          </label>
          <label>
            สาขา
            <select name="branch" defaultValue="bangkae">
              {branchConfigs.map((branch) => (
                <option key={branch.key} value={branch.key}>
                  {branchShortName(branch.key)}
                </option>
              ))}
            </select>
          </label>
          <label>
            รหัสงาน
            <select name="task" required defaultValue="">
              <option value="">เลือก</option>
              {(["1.1", "2.1", "3"] as const).map((group) => (
                <optgroup key={group} label={group === "1.1" ? "1.1 หน้าร้าน พื้นฐาน" : group === "2.1" ? "2.1 หลังร้าน พื้นฐาน" : "3 ทีมเวิร์ก"}>
                  {sopTaskCodes
                    .filter((task) => task.group === group)
                    .map((task) => (
                      <option key={task.code} value={task.code}>
                        {task.code} {task.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="wide">
            ระดับความผิด
            <select name="level" required defaultValue="">
              <option value="">เลือก</option>
              {mistakeLevels.map((level) => (
                <option key={level.value} value={level.value}>
                  {level.label} — {level.hint}
                </option>
              ))}
            </select>
          </label>
          <label className="wide">
            เกิดอะไรขึ้น (เขียนสิ่งที่เห็น)
            <input name="note" required maxLength={1000} placeholder="เช่น ไม่ติดป้ายราคาซองใหม่ 3 รายการบนชั้นหน้าเคาน์เตอร์" />
          </label>
          <button type="submit">บันทึก</button>
        </form>
      </section>

      {pendingAppeals.length ? (
        <section className="owner-ops__panel">
          <div className="section-heading">
            <p className="eyebrow">รอตัดสิน</p>
            <h3>โต้แย้ง {pendingAppeals.length} รายการ</h3>
          </div>
          {pendingAppeals.map((record) => (
            <div key={record.id} className="skill-review__row">
              <div className="skill-review__head">
                <strong>
                  {nameOf(record.staffCode)} · {record.taskCode} {taskByCode(record.taskCode)?.name}
                </strong>
                <span className="skill-review__level">{levelLabel(record.level)}</span>
              </div>
              <small className="skill-review__meta">
                {thaiDate(record.date)} · บันทึกโดย {record.recordedByName || record.recordedBy}
              </small>
              <p className="skill-review__criteria">{record.note}</p>
              <div className="skill-review__notice">
                <strong>คำโต้แย้ง</strong>
                <span>{record.appeal?.text}</span>
              </div>
              {canDecide(record, user.actualEmail) ? (
                <form action={decideAction} className="skill-review__inline">
                  <input type="hidden" name="id" value={record.id} />
                  <input name="note" placeholder="เหตุผล (ถ้ามี)" className="mistake-log__reason" />
                  <button type="submit" name="result" value="upheld">
                    คงบันทึกไว้
                  </button>
                  <button type="submit" name="result" value="voided">
                    ยกเลิกบันทึก
                  </button>
                </form>
              ) : (
                <small className="skill-review__meta">คุณเป็นคนบันทึก — ให้ผู้บริหารอีกท่านตัดสิน</small>
              )}
            </div>
          ))}
        </section>
      ) : null}

      <section className="owner-ops__panel">
        <div className="section-heading">
          <p className="eyebrow">{thaiMonth(period)}</p>
          <h3>คะแนนงานพื้นฐานรายคน</h3>
        </div>
        <div className="peer-review__table" role="table" aria-label="คะแนน ค1 รายคน">
          <div role="row" className="peer-review__tr is-head">
            <span role="columnheader">พนักงาน</span>
            <span role="columnheader">1.1</span>
            <span role="columnheader">2.1</span>
            <span role="columnheader">บันทึก</span>
          </div>
          {roster.map((entry) => {
            const [front, back_] = monthlyGroupScores(all, entry.code, period);
            return (
              <Link
                key={entry.code}
                role="row"
                href={`/admin/mistakes?period=${period}&staff=${encodeURIComponent(entry.code)}`}
                className={`peer-review__tr${entry.code === filterStaff ? " is-active" : ""}`}
              >
                <span role="cell">{entry.name || entry.code}</span>
                <span role="cell" className={front.score < 100 ? "peer-review__todo" : undefined}>
                  <strong>{front.score}</strong>
                </span>
                <span role="cell" className={back_.score < 100 ? "peer-review__todo" : undefined}>
                  <strong>{back_.score}</strong>
                </span>
                <span role="cell">{front.records + back_.records}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="owner-ops__panel">
        <div className="section-heading">
          <p className="eyebrow">{filterStaff ? nameOf(filterStaff) : "ทุกคน"}</p>
          <h3>บันทึกเดือนนี้ {monthRecords.length} รายการ</h3>
        </div>
        {monthRecords.length === 0 ? <p className="owner-ops__empty">ยังไม่มีบันทึก</p> : null}
        {monthRecords.map((record) => {
          const deduction = deductionFor(record, all);
          return (
            <div key={record.id} className={`skill-review__row${isVoided(record) ? " mistake-log__voided" : ""}`}>
              <div className="skill-review__head">
                <strong>
                  {nameOf(record.staffCode)} · {record.taskCode} {taskByCode(record.taskCode)?.name}
                </strong>
                <span className="skill-review__level">
                  {isVoided(record) ? "ยกเลิกแล้ว" : deduction === null ? "กลุ่มเหลือ 0" : `หัก ${deduction}`}
                </span>
              </div>
              <small className="skill-review__meta">
                {thaiDate(record.date)} · {branchShortName(record.branch)} · {levelLabel(record.level)} ครั้งที่{" "}
                {occurrenceOf(record, all)} ใน 3 เดือน · บันทึกโดย {record.recordedByName || record.recordedBy}
                {record.appeal ? (record.decision ? ` · โต้แย้งแล้ว: ${record.decision.result === "voided" ? "ยกเลิก" : "คงไว้"}` : " · รอตัดสินโต้แย้ง") : ""}
                {!record.appeal && !record.decision ? ` · โต้แย้งได้ถึง ${thaiDate(appealDeadline(record))}` : ""}
              </small>
              <p className="skill-review__criteria">{record.note}</p>
              {record.recordedBy === user.actualEmail && !record.appeal && !record.decision ? (
                <form action={deleteAction} className="skill-review__inline">
                  <input type="hidden" name="id" value={record.id} />
                  <button type="submit" className="mistake-log__delete">
                    ลบ (บันทึกผิด)
                  </button>
                </form>
              ) : null}
            </div>
          );
        })}
      </section>
    </main>
  );
}
