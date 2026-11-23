import Link from "next/link";
import { redirect } from "next/navigation";
import { isOwner } from "../../../../lib/owner.ts";
import { requireUser } from "../../../../lib/auth.ts";
import { listStaff } from "../../../../lib/staff-store.ts";
import { loadLeaveData } from "../../../../lib/leave-entitlement-server.ts";
import { formatWorkDate } from "../../../../lib/workflow-records.ts";
import { LeaveAdmin } from "../../../../components/LeaveAdmin.tsx";
import { revalidatePath } from "next/cache";
import { decideLeaveRequest, listLeaveRequests } from "../../../../lib/leave-requests-server.ts";

async function decide(form: FormData) {
  "use server";
  const user = await requireUser();
  if ((user.role !== "admin" && !isOwner(user.actualEmail)) || user.isImpersonating) redirect("/admin");
  const decision = form.get("decision") === "approved" ? "approved" : "rejected";
  await decideLeaveRequest(String(form.get("id") || ""), decision, user.actualEmail, String(form.get("reason") || ""));
  revalidatePath("/admin/leave");
  redirect("/admin/leave");
}
export const dynamic = "force-dynamic";
export default async function AdminLeave({searchParams}:{searchParams?:Promise<{year?:string}>}) {
  const user = await requireUser(); if (user.role !== "admin" && !(isOwner(user.actualEmail) && !user.isImpersonating)) redirect("/admin");
  const today = formatWorkDate(); const requested = Number((await searchParams)?.year); const year = Number.isInteger(requested) && requested >= 2000 && requested <= 2100 ? requested : Number(today.slice(0,4));
  const date = year === Number(today.slice(0,4)) ? today : `${year}-12-31`;
  const staff = await listStaff();
  const data = await loadLeaveData(year, staff, date);
  const pending = await listLeaveRequests({ status: "pending" }).catch(() => []);
  const nameOf = (code: string) => staff.find(p => p.code === code)?.name || code;
  return <main className="page leave-admin"><Link href="/admin" className="back-link">← กลับหน้าจัดการ</Link><section className="board-hero"><h2>สิทธิ์วันลา</h2></section><section className="owner-ops__panel"><h3>คำขอวันหยุดรออนุมัติ ({pending.length})</h3>{pending.length === 0 ? <p>ไม่มีคำขอค้าง</p> : <ul>{pending.map(r => <li key={r.id}><strong>{nameOf(r.staffCode)}</strong> {r.dates[0]}{r.dates.length > 1 ? ` – ${r.dates[r.dates.length - 1]}` : ""} ({r.dates.length} วัน){r.note ? ` · ${r.note}` : ""}<form action={decide}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="decision" value="approved" /><button type="submit" className="primary-action">อนุมัติ</button></form><form action={decide}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="decision" value="rejected" /><input type="text" name="reason" placeholder="เหตุผลที่ไม่อนุมัติ" required maxLength={300} /><button type="submit">ไม่อนุมัติ</button></form></li>)}</ul>}</section><LeaveAdmin {...data} year={year}/></main>;
}
