import { redirect } from "next/navigation";
import Link from "next/link";
import { ChecklistItemsEditor, type EditableUnit } from "../../../../../components/ChecklistItemsEditor.tsx";
import { requireUser } from "../../../../../lib/auth.ts";
import { itemsFromStrings } from "../../../../../lib/checklist-overrides.ts";
import { weeklyStockSleevePhase } from "../../../../../lib/weekly-stock-workflow.ts";
import { baseItemsFor, sharedUnitIdFor, sharedUnitTitle } from "../../../../../lib/periodic-tasks.ts";
import { weeklyEvents, weeklyEventDaysLabel } from "../../../../../lib/weekly-event-tasks.ts";

export default async function AdminChecklistWeeklyPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  // หัวข้อของสัปดาห์ทั้งหมดอยู่ใน editor ก้อนเดียว (เหมือนหน้า Daily): งานที่ช่วยกันทำ + งาน Stock
  // และหัวข้อที่เจ้าของเพิ่มเอง — สลับลำดับ ปิดหัวข้อ ย้ายรายการข้ามหัวข้อ ได้ในที่เดียว
  const weeklyUnits: EditableUnit[] = [
    {
      id: sharedUnitIdFor("weekly"),
      heading: "งานประจำสัปดาห์ที่ช่วยกันทำ (แท็บ Weekly ในหน้าเช็คลิสต์)",
      note: "รายการที่ทีมช่วยกันติ๊กในหน้า /checklist แท็บ Weekly · ใครติ๊กก็ได้ ทุกคนเห็นเหมือนกัน",
      editTitle: true,
      baseTitle: sharedUnitTitle("weekly"),
      baseItems: baseItemsFor("weekly")
    },
    {
      id: weeklyStockSleevePhase.id,
      canHide: false,
      heading: "Stock อุปกรณ์ / Sleeve (งานประจำสัปดาห์)",
      note: "ขั้นตอนที่พนักงานติ๊กในรอบตรวจนับ Stock อุปกรณ์ / Sleeve · ตั้งให้แต่ละรายการต้องแนบหลักฐาน (รูป/ลิงก์) หรือใส่รายละเอียด/ปุ่มลิงก์ ได้ทุกข้อเหมือนหน้า Daily",
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
    canHide: false,
    baseItems: event.checklist.map((item) => ({ id: item.id, title: item.title }))
  }));

  return (
    <main className="page">
      <Link href="/admin/checklist-config" className="back-link">← กลับ ปรับ Checklist</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Checklist config · Weekly</p>
          <h2>ปรับ Checklist ประจำสัปดาห์</h2>
          <p>แก้ได้เหมือนหน้า Daily — เพิ่มหัวข้อใหญ่เอง ปิดหัวข้อที่ไม่ใช้ สลับลำดับ ย้ายรายการข้ามหัวข้อ · staff เห็นทันทีที่เปิดหน้า checklist</p>
        </div>
      </section>

      <section className="section-heading">
        <p className="eyebrow">งานประจำสัปดาห์</p>
        <h3>หัวข้อและรายการที่ต้องทำ</h3>
      </section>
      <ChecklistItemsEditor
        scope="weekly-stock"
        units={weeklyUnits}
        allowCustomUnits
        customUnitHint="หัวข้อที่เพิ่มเองจะขึ้นในหน้า /checklist แท็บ Weekly ให้ทีมช่วยกันติ๊ก · ย้ายรายการเดิมเข้ามาได้ด้วยปุ่ม “ย้ายไป…”"
      />

      <section className="section-heading">
        <p className="eyebrow">วันจัดกิจกรรม</p>
        <h3>Checklist กิจกรรมแต่ละเกม</h3>
      </section>
      <ChecklistItemsEditor scope="weekly-event" units={eventUnits} allowUnitOrdering={false} />
    </main>
  );
}
