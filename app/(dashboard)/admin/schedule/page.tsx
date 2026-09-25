import { redirect } from "next/navigation";
import Link from "next/link";
import { ShiftPlanner } from "../../../../components/ShiftPlanner.tsx";
import { StoreAuditPanel } from "../../../../components/StoreAuditPanel.tsx";
import { requireUser } from "../../../../lib/auth.ts";
import { listStaff } from "../../../../lib/staff-store.ts";
import { branchConfigs } from "../../../../lib/store-config.ts";

export const dynamic = "force-dynamic";

export default async function AdminSchedulePage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  // ใครลงกะได้ — ไม่ใช่แค่คนที่อยู่ roster ของ KPI. เจ้าของ (แชมป์ / เนม) เปิดสวิตช์
  // "ลงกะได้" ที่ /admin/staff แล้วมาโผล่ในตารางนี้ โดยไม่ถูกคิดคะแนนหรือหักเงินเดือน.
  const records = await listStaff();
  const staff = records
    .filter((record) => record.active && record.onSchedule && record.code)
    .map((record) => ({
      code: record.code,
      displayName: record.displayName || record.name,
      employmentType: record.employmentType,
      branch: record.branch,
      scoredByKpi: record.onRoster
    }));

  const branches = branchConfigs.map((branch) => ({
    key: branch.key,
    label: branch.displayName,
    shortName: branch.shortName,
    tag: branch.tag,
    color: branch.color
  }));

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Shift planning</p>
          <h2>ตารางกะการทำงาน</h2>
          <p>
            วางแผนกะรายเดือนทุกสาขา · ดูรวมหรือแยกสาขา · เตือนเมื่อคนไม่พอ ลงซ้อนสองสาขา
            หรือไม่มีคนอยู่ถึงเวลาปิดร้าน
          </p>
        </div>
      </section>
      <ShiftPlanner staff={staff} plannedBy={user.email ?? user.name} branches={branches} />
      <StoreAuditPanel branch="bangkae" />
    </main>
  );
}
