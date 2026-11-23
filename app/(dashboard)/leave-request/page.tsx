import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "../../../lib/auth.ts";
import { employeeCodeForEmail } from "../../../lib/employee-directory.ts";
import { formatWorkDate } from "../../../lib/workflow-records.ts";
import { earliestAllowedDate } from "../../../lib/leave-requests.ts";
import { validDate } from "../../../lib/leave-entitlement.ts";
import { cancelLeaveRequest, createLeaveRequest, vacationBalance } from "../../../lib/leave-requests-server.ts";

export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  past: "เลือกวันที่ผ่านมาแล้วหรือวันไม่ถูกต้อง",
  too_soon: "ต้องขอล่วงหน้าอย่างน้อย 1 เดือน",
  over_limit: "ขอเกินวันหยุดที่เหลือ",
  not_entitled: "ไม่มีวันหยุดเหลือแล้ว",
  duplicate: "มีวันที่ขอซ้ำกับคำขอเดิม",
  unknown_staff: "บัญชีนี้ไม่มีรหัสพนักงาน ติดต่อแอดมิน",
  denied: "กำลังดูแทนพนักงานอยู่ ส่งคำขอแทนไม่ได้",
  range: "เลือกได้ไม่เกิน 30 วันต่อคำขอ"
};
const statusLabel = { pending: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ไม่อนุมัติ", cancelled: "ยกเลิกแล้ว" } as const;

function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end && out.length <= 31; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

async function submit(form: FormData) {
  "use server";
  const user = await requireUser();
  const code = employeeCodeForEmail(user.email);
  if (user.isImpersonating) redirect("/leave-request?status=denied");
  if (!code) redirect("/leave-request?status=unknown_staff");
  const from = String(form.get("from") || ""), to = String(form.get("to") || from);
  if (!validDate(from) || !validDate(to) || to < from) redirect("/leave-request?status=past");
  const dates = daysBetween(from, to);
  if (dates.length > 30) redirect("/leave-request?status=range");
  const result = await createLeaveRequest({ staffCode: code!, dates, note: String(form.get("note") || ""), today: formatWorkDate() });
  revalidatePath("/leave-request");
  redirect(`/leave-request?status=${result.ok ? "saved" : result.error}`);
}

async function cancel(form: FormData) {
  "use server";
  const user = await requireUser();
  const code = employeeCodeForEmail(user.email);
  if (user.isImpersonating || !code) redirect("/leave-request?status=denied");
  await cancelLeaveRequest(String(form.get("id") || ""), code!);
  revalidatePath("/leave-request");
  redirect("/leave-request?status=cancelled");
}

export default async function LeaveRequestPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireUser();
  const code = employeeCodeForEmail(user.email);
  const today = formatWorkDate();
  const earliest = earliestAllowedDate(today) || today;
  const status = (await searchParams).status;
  const balance = code ? await vacationBalance(code, today).catch(() => null) : null;
  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับหน้าหลัก</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">วันหยุดประจำปี {today.slice(0, 4)}</p>
          <h2>ขอวันหยุด</h2>
          <p>ขอล่วงหน้าอย่างน้อย 1 เดือน · เนมอนุมัติแล้ววันหยุดลงตารางกะให้เอง</p>
        </div>
      </section>
      {status === "saved" ? <section className="owner-ops__panel" role="status"><p>ส่งคำขอแล้ว รอเนมอนุมัติ</p></section> : null}
      {status === "cancelled" ? <section className="owner-ops__panel" role="status"><p>ยกเลิกคำขอแล้ว</p></section> : null}
      {status && errors[status] ? <section className="owner-ops__panel" role="alert"><p>{errors[status]}</p></section> : null}
      {!balance ? (
        <section className="owner-ops__panel"><p>{code ? "โหลดข้อมูลวันหยุดไม่ได้ ลองใหม่อีกครั้ง" : errors.unknown_staff}</p></section>
      ) : balance.allowed <= 0 ? (
        <section className="owner-ops__panel"><p>ตำแหน่งชั่วคราวยังไม่มีสิทธิ์วันหยุดประจำปี</p></section>
      ) : (
        <>
          <section className="owner-ops__panel">
            <h3>วันหยุดของฉัน</h3>
            <p>สิทธิ์ {balance.allowed} วัน · ใช้ไป {balance.used} วัน · รออนุมัติ {balance.pending} วัน · <strong>เหลือ {balance.remaining} วัน</strong></p>
          </section>
          <section className="owner-ops__panel">
            <h3>ส่งคำขอ</h3>
            <form action={submit} className="leave-request-form">
              <label>ตั้งแต่วันที่ <input type="date" name="from" min={earliest} required /></label>
              <label>ถึงวันที่ (วันเดียวไม่ต้องใส่) <input type="date" name="to" min={earliest} /></label>
              <label>หมายเหตุ (ไม่บังคับ) <input type="text" name="note" maxLength={300} /></label>
              <p>เลือกได้ตั้งแต่ {earliest} เป็นต้นไป</p>
              <button type="submit" className="primary-action" disabled={user.isImpersonating}>ส่งคำขอ</button>
            </form>
          </section>
        </>
      )}
      {balance && balance.requests.length > 0 ? (
        <section className="owner-ops__panel">
          <h3>คำขอของฉัน</h3>
          <ul>
            {balance.requests.map((r) => (
              <li key={r.id}>
                {r.dates[0]}{r.dates.length > 1 ? ` – ${r.dates[r.dates.length - 1]}` : ""} ({r.dates.length} วัน) · {statusLabel[r.status]}
                {r.reason ? ` · ${r.reason}` : ""}
                {r.status === "pending" ? (
                  <form action={cancel} style={{ display: "inline" }}><input type="hidden" name="id" value={r.id} /> <button type="submit">ยกเลิก</button></form>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
