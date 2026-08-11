import Link from "next/link";
import { StockRunWorkspace } from "../../../components/StockRunWorkspace.tsx";
import { requireUser } from "../../../lib/auth.ts";
import { branchFor, employeeCodeForEmail } from "../../../lib/employee-directory.ts";

export const dynamic = "force-dynamic";

export default async function ChecklistMonthlyPage() {
  const user = await requireUser();
  const staffCode = employeeCodeForEmail(user.email) || null;
  const branch = staffCode ? branchFor(staffCode) : "bangkae";

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Monthly checklist</p>
          <h2>Checklist งานประจำเดือน · Stock Single card</h2>
          <p>นับ Single card ประจำเดือนแยกตามเกมและพื้นที่จัดเก็บ เทียบระบบ StoreHub แล้วบันทึกผลการนับเป็นรายครั้ง ส่งให้หัวหน้าตรวจรับ — ห้ามปรับยอดในระบบก่อนหัวหน้าอนุมัติ</p>
        </div>
      </section>
      <section id="stock-single-card-work">
        <StockRunWorkspace kind="monthly" branch={branch} staffCode={staffCode} readOnly={user.isImpersonating} />
      </section>
    </main>
  );
}
