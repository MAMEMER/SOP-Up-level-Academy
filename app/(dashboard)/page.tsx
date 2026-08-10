import Link from "next/link";
import { DashboardChecklistStatus } from "../../components/DashboardChecklistStatus.tsx";
import { DashboardTaskSections } from "../../components/DashboardTaskSections.tsx";
import { MyShiftToday } from "../../components/MyShiftToday.tsx";
import { TodayWorkBoard } from "../../components/TodayWorkBoard.tsx";
import { cardStoreWorkflow } from "../../lib/card-store-workflow.ts";
import { requireUser } from "../../lib/auth.ts";
import { employeeCodeForEmail } from "../../lib/employee-directory.ts";
import { assignedWorkRecordsForDate } from "../../lib/performance-service-records.ts";
import { assignedWorkFeedForViewer, fetchAssignedWorkFeed } from "../../lib/assigned-work-feed.ts";
import { DeliveryOrdersBoard } from "../../components/DeliveryOrdersBoard.tsx";
import { fetchShiftForStaff, syncDeliveryTasks } from "../../lib/delivery-tasks-server.ts";
import { deliveryTaskVisibleTo, sortDeliveryTasks } from "../../lib/delivery-tasks.ts";
import { formatWorkDate } from "../../lib/workflow-records.ts";
import { branchFor, resolveEmployeeByEmail } from "../../lib/employee-directory.ts";
import { fetchPerformanceDailyStore } from "../../lib/performance-daily-store.ts";

export default async function HomePage() {
  const user = await requireUser();
  const workDate = formatWorkDate();
  const dailyStore = await fetchPerformanceDailyStore();
  const employeeCode = employeeCodeForEmail(user.email);
  const staffCode = resolveEmployeeByEmail(user.email);
  const branch = staffCode ? branchFor(staffCode) : "bangkae";
  const assignedWorkRecords = assignedWorkRecordsForDate(dailyStore.assignedWorkRecords, workDate).filter((record) => {
    if (user.role === "admin") return true;
    return Boolean(employeeCode && (record.employeeName === employeeCode || record.employeeName === "ทีม บางแค"));
  });
  // งานที่มอบหมายจาก 2 ส่วน: เจ้าของร้านมอบหมาย (work_assignments) + ส่งต่อจากกะปิดร้าน (work_handoffs)
  const assignedWorkFeed = assignedWorkFeedForViewer(await fetchAssignedWorkFeed(branch, workDate), {
    isAdmin: user.role === "admin",
    employeeCode
  });

  // งานส่งของ: ออเดอร์ที่จ่ายเงินแล้วบนเว็บกิลด์ เด้งเข้ากะที่รับผิดชอบเอง
  // (ก่อน 15:00 = กะปัจจุบัน · ตั้งแต่ 15:00 = กะปัจจุบัน + กะถัดไป)
  const [deliveryAll, shiftToday] = await Promise.all([
    syncDeliveryTasks(branch),
    staffCode ? fetchShiftForStaff(branch, workDate, staffCode) : Promise.resolve(null)
  ]);
  const deliveryTasks = sortDeliveryTasks(
    deliveryAll.filter((task) =>
      deliveryTaskVisibleTo(task, {
        isAdmin: user.role === "admin",
        staffCode: staffCode ?? null,
        shiftToday,
        today: workDate
      })
    ),
    workDate
  );

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

      {/* ทุกอย่างที่ต้องทำวันนี้ในกระดานเดียว — รายวัน/สัปดาห์/เดือน/มอบหมาย/ส่งต่อ */}
      <TodayWorkBoard
        phases={cardStoreWorkflow}
        assignedWorkRecords={assignedWorkRecords}
        assignedWorkFeed={assignedWorkFeed}
        deliveryTasks={deliveryTasks}
        workDate={workDate}
        canManageAssignedWork={user.role === "admin"}
        staffCode={staffCode}
        branch={branch}
      />

      <DeliveryOrdersBoard
        branch={branch}
        initialTasks={deliveryTasks}
        initialToday={workDate}
        initialShift={shiftToday}
        canAct={!user.isImpersonating}
      />

      <DashboardChecklistStatus phases={cardStoreWorkflow} staffCode={staffCode} branch={branch} />
      <DashboardTaskSections
        phases={cardStoreWorkflow}
        assignedWorkRecords={assignedWorkRecords}
        assignedWorkFeed={assignedWorkFeed}
        workDate={workDate}
        canManageAssignedWork={user.role === "admin"}
        staffCode={staffCode}
        branch={branch}
      />
    </main>
  );
}
