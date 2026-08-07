import { redirect } from "next/navigation";
import Link from "next/link";
import { ChecklistItemsEditor, type EditableUnit } from "../../../../../components/ChecklistItemsEditor.tsx";
import { requireUser } from "../../../../../lib/auth.ts";
import { itemsFromStrings } from "../../../../../lib/checklist-overrides.ts";
import { monthlyStockSinglePhase } from "../../../../../lib/monthly-stock-single-workflow.ts";

export default async function AdminChecklistMonthlyPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const units: EditableUnit[] = [
    {
      id: monthlyStockSinglePhase.id,
      heading: "Stock Single card (งานประจำเดือน)",
      note: "รายการที่พนักงานติ๊กในหน้า Checklist ประจำเดือน → Stock Single card",
      editTitle: true,
      baseTitle: monthlyStockSinglePhase.title,
      editGoal: true,
      goalLabel: "รายละเอียดงาน (goal)",
      baseGoal: monthlyStockSinglePhase.goal,
      editTime: true,
      timeLabel: "เวลา (แสดงบนการ์ด)",
      baseTimeLabel: monthlyStockSinglePhase.timeLabel,
      editShift: true,
      baseShiftLabel: monthlyStockSinglePhase.shiftLabel,
      baseItems: itemsFromStrings(monthlyStockSinglePhase.checklist)
    }
  ];

  return (
    <main className="page">
      <Link href="/admin/checklist-config" className="back-link">← กลับ ปรับ Checklist</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Checklist config · Monthly</p>
          <h2>ปรับ Checklist ประจำเดือน</h2>
          <p>งาน Stock Single card ประจำเดือน — แก้รายการที่พนักงานต้องติ๊ก · staff เห็นทันทีที่เปิดหน้า checklist</p>
        </div>
      </section>
      <ChecklistItemsEditor scope="monthly-stock" units={units} />
    </main>
  );
}
