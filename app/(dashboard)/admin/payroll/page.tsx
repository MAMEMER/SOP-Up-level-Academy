import { redirect } from "next/navigation";
import { PayrollBoard } from "../../../../components/PayrollBoard.tsx";
import { requireUser } from "../../../../lib/auth.ts";
import { isOwner } from "../../../../lib/owner.ts";
import { periodFor, periodIdForDate } from "../../../../lib/payroll.ts";

// เงินเดือนพนักงาน — เจ้าของร้านเท่านั้น (INVARIANTS §4). ข้อมูลโหลดจาก /api/payroll ฝั่ง client.
export const dynamic = "force-dynamic";

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const user = await requireUser();
  if (!isOwner(user.actualEmail) || user.isImpersonating) redirect("/admin");
  const { period } = await searchParams;
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const initial = period && periodFor(period) ? period : periodIdForDate(today);
  return (
    <main className="page">
      <PayrollBoard initialPeriod={initial} />
    </main>
  );
}
