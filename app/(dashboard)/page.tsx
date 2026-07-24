import Link from "next/link";
import { DashboardChecklistStatus } from "../../components/DashboardChecklistStatus.tsx";
import { DashboardTaskSections } from "../../components/DashboardTaskSections.tsx";
import { MyShiftToday } from "../../components/MyShiftToday.tsx";
import { cardStoreWorkflow } from "../../lib/card-store-workflow.ts";
import { requireUser } from "../../lib/auth.ts";
import { employeeCodeForEmail } from "../../lib/employee-directory.ts";
import { assignedWorkRecordsForDate, fetchPerformanceDailyStore } from "../../lib/performance-service-records.ts";
import { formatWorkDate } from "../../lib/workflow-records.ts";
import { branchFor, resolveEmployeeByEmail } from "../../lib/employee-directory.ts";

export default async function HomePage() {
  const user = await requireUser();
  const workDate = formatWorkDate();
  const dailyStore = await fetchPerformanceDailyStore();
  const employeeCode = employeeCodeForEmail(user.email);
  const staffCode = resolveEmployeeByEmail(user.email);
  const assignedWorkRecords = assignedWorkRecordsForDate(dailyStore.assignedWorkRecords, workDate).filter((record) => {
    if (user.role === "admin") return true;
    return Boolean(employeeCode && (record.employeeName === employeeCode || record.employeeName === "ทีม บางแค"));
  });

  return (
    <main className="page">
      <section className="board-hero apple-store-hero">
        <div>
          <p className="eyebrow">หน้าหลัก</p>
          <h2>SOP Up Level</h2>
          <p>ศูนย์งานประจำวันของทีมหน้าร้าน — checklist, stock, จัดส่ง, ปิดร้าน ในที่เดียว</p>
        </div>
        <div className="hero-actions">
          <Link href="/checklist" className="primary-action">เปิด Checklist</Link>
          {user.role === "admin" ? <Link href="/admin/performance-score" className="btn-soft">คะแนนพนักงาน</Link> : null}
        </div>
      </section>

      {staffCode ? <MyShiftToday staffCode={staffCode} branch={branchFor(staffCode)} workDate={workDate} /> : null}

      <DashboardChecklistStatus phases={cardStoreWorkflow} />
      <DashboardTaskSections
        phases={cardStoreWorkflow}
        assignedWorkRecords={assignedWorkRecords}
        workDate={workDate}
        canManageAssignedWork={user.role === "admin"}
      />
    </main>
  );
}
