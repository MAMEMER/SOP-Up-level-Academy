import { redirect } from "next/navigation";
import Link from "next/link";
import { ChecklistItemsEditor, type EditableUnit } from "../../../../../components/ChecklistItemsEditor.tsx";
import { requireUser } from "../../../../../lib/auth.ts";
import { itemsFromStrings } from "../../../../../lib/checklist-overrides.ts";
import { weeklyStockSleevePhase } from "../../../../../lib/weekly-stock-workflow.ts";
import { weeklyEvents, weeklyEventDaysLabel } from "../../../../../lib/weekly-event-tasks.ts";

export default async function AdminChecklistWeeklyPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const stockUnits: EditableUnit[] = [
    {
      id: weeklyStockSleevePhase.id,
      heading: "Stock อุปกรณ์ / Sleeve (งานประจำสัปดาห์)",
      note: "รายการที่พนักงานติ๊กในหน้า Checklist ประจำสัปดาห์ → Stock อุปกรณ์ / Sleeve · รายการที่เพิ่มเองตั้งให้ต้องแนบหลักฐาน (รูป/ลิงก์) ได้เหมือนหน้า Daily",
      editEvidence: true,
      editTitle: true,
      baseTitle: weeklyStockSleevePhase.title,
      editGoal: true,
      goalLabel: "รายละเอียดงาน (goal)",
      baseGoal: weeklyStockSleevePhase.goal,
      editTime: true,
      timeLabel: "เวลา (แสดงบนการ์ด)",
      baseTimeLabel: weeklyStockSleevePhase.timeLabel,
      editShift: true,
      baseShiftLabel: weeklyStockSleevePhase.shiftLabel,
      baseItems: itemsFromStrings(weeklyStockSleevePhase.checklist)
    }
  ];

  const eventUnits: EditableUnit[] = weeklyEvents.map((event) => ({
    id: event.id,
    heading: `Checklist วันจัดกิจกรรม · ${event.name} (${weeklyEventDaysLabel(event)})`,
    note: "ขั้นตอนที่พนักงานติ๊กในหน้า /weekly-task ของกิจกรรมนี้ · แก้ชื่อขั้นตอน เวลา กะที่รับผิดชอบ เพิ่ม/ลบ/สลับลำดับได้",
    editTime: true,
    timeLabel: "เวลา checklist (แสดงบนการ์ด)",
    baseTimeLabel: event.timeWindow,
    editShift: true,
    baseShiftLabel: event.shiftLabel,
    baseItems: event.checklist.map((item) => ({ id: item.id, title: item.title }))
  }));

  return (
    <main className="page">
      <Link href="/admin/checklist-config" className="back-link">← กลับ ปรับ Checklist</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Checklist config · Weekly</p>
          <h2>ปรับ Checklist ประจำสัปดาห์</h2>
          <p>งาน Stock อุปกรณ์ / Sleeve และ checklist วันจัดกิจกรรมของแต่ละเกม — staff เห็นทันทีที่เปิดหน้า checklist</p>
        </div>
      </section>

      <section className="section-heading">
        <p className="eyebrow">งาน Stock</p>
        <h3>Stock อุปกรณ์ / Sleeve</h3>
      </section>
      <ChecklistItemsEditor scope="weekly-stock" units={stockUnits} />

      <section className="section-heading">
        <p className="eyebrow">วันจัดกิจกรรม</p>
        <h3>Checklist กิจกรรมแต่ละเกม</h3>
      </section>
      <ChecklistItemsEditor scope="weekly-event" units={eventUnits} />
    </main>
  );
}
