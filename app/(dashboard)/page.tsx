import Link from "next/link";
import { Suspense } from "react";
import { AssignedDailyList } from "../../components/AssignedDailyList.tsx";
import { SupplyNeedsBanner } from "../../components/SupplyNeedsBanner.tsx";
import { StaffDocsBanner } from "../../components/StaffDocsBanner.tsx";
import { FlowerReminderBanner } from "../../components/FlowerReminderBanner.tsx";
import { TaskInbox } from "../../components/TaskInbox.tsx";
import { TodayTaskList } from "../../components/TodayTaskList.tsx";
import { MyShiftToday } from "../../components/MyShiftToday.tsx";
import { cardStoreWorkflow } from "../../lib/card-store-workflow.ts";
import { requireUser } from "../../lib/auth.ts";
import { employeeCodeForEmail } from "../../lib/employee-directory.ts";
import { assignedWorkRecordsForDate } from "../../lib/performance-service-records.ts";
import { assignedWorkFeedForViewer, fetchAssignedWorkFeed } from "../../lib/assigned-work-feed.ts";
import { weeklyEventsActiveOn } from "../../lib/weekly-event-tasks.ts";
import { DeliveryOrdersBoard } from "../../components/DeliveryOrdersBoard.tsx";
import { ParcelOrdersBoard } from "../../components/ParcelOrdersBoard.tsx";
import { fetchShiftForStaff, syncDeliveryTasks, workBranchFor } from "../../lib/delivery-tasks-server.ts";
import { DELIVERY_BRANCH, deliveryTaskState, deliveryTaskVisibleTo, sortDeliveryTasks, type DeliveryTask } from "../../lib/delivery-tasks.ts";
import { TodaySummary } from "../../components/TodaySummary.tsx";
import { formatWorkDate } from "../../lib/workflow-records.ts";
import { resolveEmployeeByEmail } from "../../lib/employee-directory.ts";
import { fetchPerformanceDailyStore } from "../../lib/performance-daily-store.ts";
import { teamRecordName } from "../../lib/store-config.ts";

// หน้าแรก = "งานที่มอบหมายให้ฉัน" เป็นหลัก แยกเป็น 3 ประเภทให้ชัด (รายวัน · งานประจำ/เป็นรอบ ·
// งานโปรเจกต์) แล้วต่อด้วยออเดอร์ที่ต้องส่ง. รายการรวมยาวๆ ของทั้งร้านย้ายไปอยู่หน้าของมันเอง
// (/checklist, /tasks) เพราะซ้ำกันและดันงานของตัวเองตกจอ.
export default async function HomePage() {
  const user = await requireUser();
  const workDate = formatWorkDate();
  const dailyStore = await fetchPerformanceDailyStore();
  const employeeCode = employeeCodeForEmail(user.email);
  const staffCode = resolveEmployeeByEmail(user.email);
  const branch = await workBranchFor(staffCode, workDate);
  // หน้าแรกเป็นของ "คนที่เข้าระบบอยู่" เท่านั้น — แอดมินก็เห็นแค่งานของตัวเอง
  // (ภาพรวมทั้งร้านอยู่ที่ /admin/ops) ไม่งั้นงานของตัวเองจมอยู่ในลิสต์ของทุกคน
  const assignedWorkRecords = assignedWorkRecordsForDate(dailyStore.assignedWorkRecords, workDate).filter(
    (record) => Boolean(employeeCode && (record.employeeName === employeeCode || record.employeeName === teamRecordName(branch)))
  );
  // งานที่มอบหมายจาก 2 ส่วน: เจ้าของร้านมอบหมาย (work_assignments) + ส่งต่อจากกะปิดร้าน (work_handoffs)
  const assignedWorkFeed = assignedWorkFeedForViewer(await fetchAssignedWorkFeed(branch, workDate), {
    isAdmin: false,
    employeeCode
  });

  // งานกิจกรรมประจำสัปดาห์ (Lorcana, Pokemon, Rift Bound ฯลฯ) ที่ "ถึงกำหนดวันนี้" ตาม activeDays
  // = งานของทีมบางแค ขึ้นเป็นการ์ดแรกในหัวข้อ "งานที่มอบหมาย" อัตโนมัติทุกวันจัดกิจกรรม
  // (ชุด activeDays เดียวกับที่ปฏิทินกิจกรรม /admin/calendar ใช้ → เชื่อมกันเสมอ)
  const weeklyEventIds = branch === "bangkae" ? weeklyEventsActiveOn(workDate).map((event) => event.id) : [];

  // งานส่งของ: ออเดอร์ที่จ่ายเงินแล้วบนเว็บกิลด์ เด้งเข้ากะที่รับผิดชอบเอง
  // (ก่อน 15:00 = กะปัจจุบัน · ตั้งแต่ 15:00 = กะปัจจุบัน + กะถัดไป)
  // ออเดอร์ออนไลน์เป็นงานของสาขาส่งของสาขาเดียว (DELIVERY_BRANCH) — คนที่เข้ากะสาขาอื่นวันนี้ไม่เห็นบอร์ดนี้
  const handlesDelivery = branch === DELIVERY_BRANCH;
  const [deliveryAll, shiftToday] = await Promise.all([
    handlesDelivery ? syncDeliveryTasks().catch(() => [] as DeliveryTask[]) : Promise.resolve([] as DeliveryTask[]),
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
          <h2>งานของฉันวันนี้</h2>
          <p>งานที่มอบหมายให้คุณ · งานประจำที่ครบกำหนด · ออเดอร์ที่ต้องส่ง</p>
        </div>
        <div className="hero-actions">
          <Link href="/checklist" className="primary-action">เปิด Checklist</Link>
          {user.role === "admin" ? <Link href="/admin" className="btn-soft">หน้ารวมงานจัดการ</Link> : null}
        </div>
      </section>

      {/* ทำด่วน: เอกสารประกันสังคม — ขึ้นจนกว่าพนักงานคนนี้จะส่ง (เตือนอย่างเดียว ไม่ผูก KPI) */}
      <StaffDocsBanner email={user.email} />
      <FlowerReminderBanner email={user.email} />

      {/* ของที่ต้องสั่ง — บนสุดของหน้า เพราะลืมสั่งแล้วของขาดหน้าร้านทันที
          Suspense กันไม่ให้การเรียก StoreHub หน่วงงานของตัวเองที่เหลือทั้งหน้า */}
      <Suspense fallback={null}>
        <SupplyNeedsBanner branch={branch} />
      </Suspense>

      {/* เหลืออะไรบ้างวันนี้ แบบนับเป็นตัวเลข ไม่ใช่ลิสต์ยาว */}
      <TodaySummary
        phases={cardStoreWorkflow}
        branch={branch}
        workDate={workDate}
        shift={shiftToday === "s1" || shiftToday === "s2" ? shiftToday : null}
        staffCode={staffCode ?? null}
        assignedRemaining={assignedWorkFeed.filter((item) => item.statusClass !== "workflow-status-green").length}
        deliveryRemaining={deliveryTasks.filter((task) => deliveryTaskState(task, workDate) !== "done").length}
      />

      {/* พัสดุการ์ดที่ถึงร้านแล้วรอแกะ-เช็ค-ลง — ผูก KPI จึงอยู่บนสุดของงาน (ไม่มีกล่องค้าง = ไม่โชว์) */}
      <ParcelOrdersBoard branch={branch} compact canAct={!user.isImpersonating} />

      {staffCode ? <MyShiftToday staffCode={staffCode} branch={branch} workDate={workDate} /> : null}

      <section className="section-heading" id="assigned-work">
        <p className="eyebrow">งานที่มอบหมายให้ฉัน</p>
        <h3>แยกตามประเภทงาน</h3>
      </section>

      {staffCode || employeeCode ? (
        <>
          <article className="task-section">
            <div className="task-section-head">
              <div>
                <p className="eyebrow">รายวัน</p>
                <h3>งานกิจกรรม · งานที่มอบหมาย / ส่งต่อมาให้</h3>
              </div>
            </div>
            <AssignedDailyList
              records={assignedWorkRecords}
              feed={assignedWorkFeed}
              weeklyEventIds={weeklyEventIds}
              workDate={workDate}
              canSeeStatus={user.role === "admin"}
            />
          </article>

          {staffCode ? (
            <article className="task-section" id="today-tasks">
              <div className="task-section-head">
                <div>
                  <p className="eyebrow">งานประจำ / เป็นรอบ</p>
                  <h3>งานประจำที่ครบกำหนดวันนี้</h3>
                </div>
                <Link className="status-pill" href="/tasks">ดูงานประจำทั้งหมด</Link>
              </div>
              <TodayTaskList
                branch={branch}
                date={workDate}
                shift={shiftToday === "s1" || shiftToday === "s2" ? shiftToday : null}
                staffCode={staffCode}
                readOnly={user.isImpersonating}
              />
            </article>
          ) : null}

          {staffCode ? (
            <article className="task-section">
              <div className="task-section-head">
                <div>
                  <p className="eyebrow">แจ้งเตือนงาน</p>
                  <h3>งานที่มอบหมาย ที่ยังไม่ได้ส่ง</h3>
                </div>
                <Link className="status-pill" href="/my-tasks/file">แฟ้มงาน</Link>
              </div>
              <TaskInbox branch={branch} staffCode={staffCode} today={workDate} readOnly={user.isImpersonating} />
            </article>
          ) : null}
        </>
      ) : (
        // บัญชีที่ไม่ได้ผูกรหัสพนักงานไม่มีงานของตัวเอง — ส่งไปหน้าที่คุมงานทุกคนแทน
        <p className="assign-work__empty">
          บัญชีนี้ยังไม่ผูกกับรหัสพนักงาน — ดูงานของทุกคนได้ที่{" "}
          <Link href="/admin/projects">มอบหมายงานเดี่ยว/กลุ่ม</Link>
        </p>
      )}

      {handlesDelivery ? (
        <>
          <div id="delivery" />
          <DeliveryOrdersBoard
            branch={branch}
            initialTasks={deliveryTasks}
            initialToday={workDate}
            initialShift={shiftToday}
            canAct={!user.isImpersonating}
          />
        </>
      ) : null}
    </main>
  );
}
