import Link from "next/link";
import { StockRunWorkspace } from "../../../components/StockRunWorkspace.tsx";
import { requireUser } from "../../../lib/auth.ts";
import { branchFor, employeeCodeForEmail } from "../../../lib/employee-directory.ts";

export const dynamic = "force-dynamic";

export default async function ChecklistWeeklyPage() {
  const user = await requireUser();
  const staffCode = employeeCodeForEmail(user.email) || null;
  const branch = staffCode ? branchFor(staffCode) : "bangkae";

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Weekly checklist</p>
          <h2>Checklist งานประจำสัปดาห์ · Stock อุปกรณ์ / Sleeve</h2>
          <p>นับ Stock อุปกรณ์ / Sleeve ประจำสัปดาห์ ตรวจของจริงหน้าร้านและห้อง Stock แล้วบันทึกผลการนับเป็นรายครั้ง ส่งให้หัวหน้าตรวจรับ</p>
        </div>
      </section>
      <section id="stock-sleeve-work">
        <StockRunWorkspace kind="weekly" branch={branch} staffCode={staffCode} readOnly={user.isImpersonating} />
      </section>
    </main>
  );
}
