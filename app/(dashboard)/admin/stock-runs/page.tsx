import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth.ts";
import { employeeDirectory } from "../../../../lib/employee-directory.ts";
import { fetchStockRunsForBranch } from "../../../../lib/stock-runs-server.ts";
import { resolveAdminBranch } from "../../../../lib/admin-branch.ts";
import { AdminBranchSwitch } from "../../../../components/AdminBranchSwitch.tsx";
import { StockRunAssign } from "../../../../components/StockRunAssign.tsx";

export const dynamic = "force-dynamic";

export default async function AdminStockRunsPage({ searchParams }: { searchParams?: Promise<{ branch?: string }> }) {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const branch = await resolveAdminBranch((searchParams ? await searchParams : {}).branch);

  const staff = employeeDirectory
    .map((entry) => ({ code: entry.code, displayName: entry.displayName }));

  const runs = await fetchStockRunsForBranch(branch);

  return (
    <main className="page">
      <Link href="/" className="back-link">
        ← กลับ Dashboard
      </Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">ตรวจนับ Stock</p>
          <h2>ตรวจรับงานตรวจนับ Stock</h2>
          <p>
            มอบหมายงานตรวจนับ Stock อุปกรณ์ / Sleeve (รายสัปดาห์) และ Single card (รายเดือน) ให้พนักงาน แล้วตรวจรับผลการนับพร้อมหลักฐานเป็นรายครั้ง —
            บันทึกถาวรและเก็บประวัติการตรวจทุกครั้ง
          </p>
        </div>
      </section>
      <div className="admin-branch-bar">
        <AdminBranchSwitch value={branch} />
        <small>ข้อมูลในหน้านี้เป็นของสาขาที่เลือก</small>
      </div>

      <StockRunAssign key={branch} branch={branch} staff={staff} initialRuns={runs} />
    </main>
  );
}
