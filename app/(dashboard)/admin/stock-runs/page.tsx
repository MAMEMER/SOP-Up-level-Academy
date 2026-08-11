import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth.ts";
import { employeeDirectory } from "../../../../lib/employee-directory.ts";
import { fetchStockRunsForBranch } from "../../../../lib/stock-runs-server.ts";
import { StockRunAssign } from "../../../../components/StockRunAssign.tsx";

const ADMIN_BRANCH = "bangkae";

export const dynamic = "force-dynamic";

export default async function AdminStockRunsPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const staff = employeeDirectory
    .filter((entry) => entry.branch === ADMIN_BRANCH)
    .map((entry) => ({ code: entry.code, displayName: entry.displayName }));

  const runs = await fetchStockRunsForBranch(ADMIN_BRANCH);

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

      <StockRunAssign branch={ADMIN_BRANCH} staff={staff} initialRuns={runs} />
    </main>
  );
}
