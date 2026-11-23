import Link from "next/link";
import { redirect } from "next/navigation";
import { isOwner } from "../../../../lib/owner.ts";
import { requireUser } from "../../../../lib/auth.ts";
import { listStaff } from "../../../../lib/staff-store.ts";
import { loadLeaveData } from "../../../../lib/leave-entitlement-server.ts";
import { formatWorkDate } from "../../../../lib/workflow-records.ts";
import { LeaveAdmin } from "../../../../components/LeaveAdmin.tsx";
export const dynamic = "force-dynamic";
export default async function AdminLeave({searchParams}:{searchParams?:Promise<{year?:string}>}) {
  const user = await requireUser(); if (user.role !== "admin" && !(isOwner(user.actualEmail) && !user.isImpersonating)) redirect("/admin");
  const today = formatWorkDate(); const requested = Number((await searchParams)?.year); const year = Number.isInteger(requested) && requested >= 2000 && requested <= 2100 ? requested : Number(today.slice(0,4));
  const date = year === Number(today.slice(0,4)) ? today : `${year}-12-31`;
  const data = await loadLeaveData(year, await listStaff(), date);
  return <main className="page leave-admin"><Link href="/admin" className="back-link">← กลับหน้าจัดการ</Link><section className="board-hero"><h2>สิทธิ์วันลา</h2></section><LeaveAdmin {...data} year={year}/></main>;
}
