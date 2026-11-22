import { kpiV2Visible } from "../../../lib/launch-gate.ts";
import { notFound } from "next/navigation";
import Link from "next/link";
import { KpiDraftForm } from "../../../components/KpiDraftForm.tsx";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireUser } from "../../../lib/auth.ts";
import { employeeCodeForEmail } from "../../../lib/employee-directory.ts";
import { workBranchFor } from "../../../lib/delivery-tasks-server.ts";
import { formatWorkDate } from "../../../lib/workflow-records.ts";
import { deleteOwnTeachLog, getTeachLogs, saveTeachLog, TEACH_GAMES } from "../../../lib/kpi-v2-person-store.ts";

export const dynamic = "force-dynamic";
async function identity() {
  const user = await requireUser();
  const code = employeeCodeForEmail(user.email);
  if (!code || user.isImpersonating) redirect("/teach-log?status=denied");
  return code;
}
async function save(form: FormData) {
  "use server";
  const code = await identity();
  const game = String(form.get("game") || "");
  const customers = Number(form.get("customers"));
  const note = String(form.get("note") || "").trim();
  if (!TEACH_GAMES.some((item) => item === game) || !Number.isInteger(customers) || customers < 1 || customers > 20 || note.length > 300) redirect("/teach-log?status=invalid");
  try { await saveTeachLog({ id: randomUUID(), staffCode: code, branch: await workBranchFor(code, formatWorkDate()), game, customers, note, createdAt: new Date().toISOString() }); }
  catch { redirect("/teach-log?status=error"); }
  redirect("/teach-log?status=saved");
}
async function remove(form: FormData) {
  "use server";
  const code = await identity();
  const id = String(form.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/teach-log?status=error");
  try { await deleteOwnTeachLog(id, code, formatWorkDate()); } catch { redirect("/teach-log?status=error"); }
  redirect("/teach-log?status=deleted");
}
export default async function TeachLogPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireUser(); if (!kpiV2Visible(user.role)) notFound();
  const code = employeeCodeForEmail(user.email);
  const today = formatWorkDate();
  const { status } = await searchParams;
  const logs = code ? await getTeachLogs(today.slice(0, 7)).then((items) => items.filter((item) => item.staffCode === code)).catch(() => null) : null;
  const messages: Record<string, string> = { saved: "บันทึกแล้ว", deleted: "ลบรายการแล้ว", error: "ทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง", invalid: "กรุณาตรวจสอบข้อมูล", denied: "บัญชีนี้บันทึกไม่ได้" };
  return <main className="page skill-review kpi-person-page"><Link href="/" className="back-link">← กลับหน้าหลัก</Link><section className="board-hero"><div><h2>บันทึกสอนเกม</h2><p>บันทึกแต่ละครั้งที่สอนลูกค้า</p></div></section>
    {status && messages[status] ? <p className="input-status">{messages[status]}</p> : null}
    {code && !user.isImpersonating ? <KpiDraftForm storageKey={`teach-log:${code}`} action={save} className="owner-ops__panel kpi-entry-form"><label>เกม <select name="game" required defaultValue=""><option value="" disabled>เลือกเกม</option>{TEACH_GAMES.map((game) => <option key={game}>{game}</option>)}</select></label><label>จำนวนลูกค้า <input type="number" name="customers" min="1" max="20" required /></label><label>หมายเหตุ (ไม่บังคับ) <textarea name="note" maxLength={300} /></label><button type="submit" className="btn-cute">บันทึกสอนเกม</button></KpiDraftForm> : <p>บัญชีนี้ไม่มีรหัสพนักงาน หรือกำลังดูแทนพนักงาน จึงบันทึกไม่ได้</p>}
    <section className="owner-ops__panel"><h3>รายการเดือนนี้</h3>{logs === null ? <p>ไม่สามารถโหลดรายการได้</p> : logs.length === 0 ? <p>ยังไม่มีรายการ</p> : logs.map((item) => <div className="skill-review__row" key={item.id}><strong>{item.game} · {item.customers} คน</strong><p>{new Date(new Date(item.createdAt).getTime() + 7 * 3600000).toISOString().slice(0, 10)} {item.note}</p>{new Date(new Date(item.createdAt).getTime() + 7 * 3600000).toISOString().slice(0, 10) === today && !user.isImpersonating ? <form action={remove}><input type="hidden" name="id" value={item.id} /><button type="submit">ลบรายการ</button></form> : null}</div>)}</section>
  </main>;
}
