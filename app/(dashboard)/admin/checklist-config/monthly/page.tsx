import { redirect } from "next/navigation";
import Link from "next/link";
import { ChecklistItemsEditor, type EditableUnit } from "../../../../../components/ChecklistItemsEditor.tsx";
import { requireUser } from "../../../../../lib/auth.ts";
import { itemsFromStrings } from "../../../../../lib/checklist-overrides.ts";
import { monthlyStockSinglePhase } from "../../../../../lib/monthly-stock-single-workflow.ts";
import { baseItemsFor, sharedUnitIdFor, sharedUnitTitle } from "../../../../../lib/periodic-tasks.ts";

export default async function AdminChecklistMonthlyPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  // เหมือนหน้า Weekly: หัวข้อของเดือนทั้งหมดอยู่ใน editor ก้อนเดียว และเพิ่มหัวข้อเองได้
  const units: EditableUnit[] = [
    {
      id: sharedUnitIdFor("monthly"),
      heading: "งานประจำเดือนที่ช่วยกันทำ (แท็บ Monthly ในหน้าเช็คลิสต์)",
      note: "รายการที่ทีมช่วยกันติ๊กในหน้า /checklist แท็บ Monthly · ใครติ๊กก็ได้ ทุกคนเห็นเหมือนกัน",
      editTitle: true,
      baseTitle: sharedUnitTitle("monthly"),
      editGoal: true,
      goalLabel: "รายละเอียดงาน (พนักงานอ่านใต้ชื่อหัวข้อ)",
      editTime: true,
      timeLabel: "เวลา (แสดงบนการ์ด) เช่น ทำให้เสร็จก่อนวันที่ 5 ของเดือน",
      editShift: true,
      editAnswer: true,
      baseItems: baseItemsFor("monthly")
    },
    {
      id: monthlyStockSinglePhase.id,
      canHide: false,
      heading: "Stock Single card (งานประจำเดือน)",
      note: "ขั้นตอนที่พนักงานติ๊กในรอบตรวจนับ Stock Single card · ตั้งให้แต่ละรายการต้องแนบหลักฐาน (รูป/ลิงก์) หรือใส่รายละเอียด/ปุ่มลิงก์ ได้ทุกข้อเหมือนหน้า Daily",
      editEvidence: true,
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
          <p>แก้ได้เหมือนหน้า Daily — เพิ่มหัวข้อใหญ่เอง ปิดหัวข้อที่ไม่ใช้ สลับลำดับ ย้ายรายการข้ามหัวข้อ · staff เห็นทันทีที่เปิดหน้า checklist</p>
        </div>
      </section>

      <section className="section-heading">
        <p className="eyebrow">งานประจำเดือน</p>
        <h3>หัวข้อและรายการที่ต้องทำ</h3>
      </section>
      <ChecklistItemsEditor
        scope="monthly-stock"
        units={units}
        allowCustomUnits
        customUnitHint="หัวข้อที่เพิ่มเองจะขึ้นในหน้า /checklist แท็บ Monthly ให้ทีมช่วยกันติ๊ก · ย้ายรายการเดิมเข้ามาได้ด้วยปุ่ม “ย้ายไป…”"
      />
    </main>
  );
}
