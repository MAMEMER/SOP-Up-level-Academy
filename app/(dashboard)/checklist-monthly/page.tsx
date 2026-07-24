import Link from "next/link";
import { MonthlyStockSingleChecklist } from "../../../components/MonthlyStockSingleChecklist.tsx";
import { requireUser } from "../../../lib/auth.ts";

export default async function ChecklistMonthlyPage() {
  await requireUser();

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Monthly checklist</p>
          <h2>Checklist งานประจำเดือน · Stock Single card</h2>
          <p>นับ Single card ประจำเดือนแยกตามเกมและพื้นที่จัดเก็บ ให้พนักงานนับจริงเทียบระบบ StoreHub แล้วสรุปยอด +/- โดยห้ามปรับยอดในระบบก่อนหัวหน้าอนุมัติ</p>
        </div>
      </section>
      <MonthlyStockSingleChecklist />
    </main>
  );
}
