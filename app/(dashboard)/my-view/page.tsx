import Link from "next/link";
import { requireUser } from "../../../lib/auth.ts";
import {
  branchFor,
  displayNameFor,
  employeeCodeForEmail,
  employeeCodes,
  employeeDirectory
} from "../../../lib/employee-directory.ts";
import { currentReviewPeriod, getPerformanceScoreRows } from "../../../lib/performance-score-data.ts";
import { fetchChecklistKpiInput } from "../../../lib/checklist-kpi.ts";
import { fetchAttendanceSource } from "../../../lib/planner-kpi.ts";
import { assignedWorkRecordsForDate } from "../../../lib/performance-service-records.ts";
import { assignedWorkFeedForViewer, fetchAssignedWorkFeed } from "../../../lib/assigned-work-feed.ts";
import { formatWorkDate } from "../../../lib/workflow-records.ts";
import { cardStoreWorkflow } from "../../../lib/card-store-workflow.ts";
import { resolveStaffViewSelection } from "../../../lib/staff-view.ts";
import { StaffScoreCard } from "../../../components/StaffScoreCard.tsx";
import { MyShiftToday } from "../../../components/MyShiftToday.tsx";
import { MyAssignedWork } from "../../../components/MyAssignedWork.tsx";
import { MyProjects } from "../../../components/MyProjects.tsx";
import { DashboardChecklistStatus } from "../../../components/DashboardChecklistStatus.tsx";
import { DashboardTaskSections } from "../../../components/DashboardTaskSections.tsx";
import { fetchPerformanceDailyStore } from "../../../lib/performance-daily-store.ts";

// KPI window follows the calendar: 1st of this month → today (Asia/Bangkok)
const reviewPeriod = () => currentReviewPeriod();

type PageProps = {
  searchParams?: Promise<{ staff?: string }>;
};

export default async function MyViewPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const isOwner = user.role === "admin";
  const selfCode = employeeCodeForEmail(user.email);
  const params = searchParams ? await searchParams : {};

  const { selectedCode, canSwitch } = resolveStaffViewSelection({
    isOwner,
    selfCode,
    requestedCode: params.staff,
    validCodes: employeeCodes
  });

  if (!selectedCode) {
    return (
      <main className="page">
        <section className="board-hero">
          <div>
            <p className="eyebrow">มุมมองพนักงาน</p>
            <h2>งานของฉัน</h2>
          </div>
        </section>
        <section className="staff-empty">
          <p>ยังไม่พบชื่อพนักงานที่ผูกกับบัญชีนี้ กรุณาแจ้งหัวหน้า</p>
          <small>บัญชี: {user.email}</small>
        </section>
      </main>
    );
  }

  const branch = branchFor(selectedCode);
  const workDate = formatWorkDate();
  const displayName = displayNameFor(selectedCode);

  const period = reviewPeriod();
  const [dailyStore, attendance, feed, checklistKpi] = await Promise.all([
    fetchPerformanceDailyStore(),
    fetchAttendanceSource(branch),
    fetchAssignedWorkFeed(branch, workDate),
    // Without this the checklist KPI treats every scheduled+clocked-in day since go-live as a
    // missing checklist day, over-deducting the Checklist category vs. the admin view.
    // หัวข้อ submitted past its own deadline → -2 each (ส่งช้า) comes back in the same read.
    fetchChecklistKpiInput(branch, period.startDate, period.endDate)
  ]);

  const rows = getPerformanceScoreRows(period.id, dailyStore, attendance, checklistKpi.submittedDays, checklistKpi.lateSubmissions);
  const row = rows.find((item) => item.employeeName === selectedCode);

  const assignedWorkRecords = assignedWorkRecordsForDate(dailyStore.assignedWorkRecords, workDate).filter(
    (record) => record.employeeName === selectedCode || record.employeeName === "ทีม บางแค"
  );
  // Always scope the feed to the selected staff — even for the owner, this page shows
  // exactly what that one employee would see (self-view), never the whole team.
  const assignedWorkFeed = assignedWorkFeedForViewer(feed, { isAdmin: false, employeeCode: selectedCode });

  return (
    <main className="page">
      <section className="board-hero">
        <div>
          <p className="eyebrow">มุมมองพนักงาน</p>
          <h2>งานของฉัน · {displayName}</h2>
          <p>เช็คลิสต์ · งานที่มอบหมาย · งานส่งต่อ และคะแนนของคุณ ในที่เดียว</p>
        </div>
        <div className="hero-actions">
          <Link href="/checklist" className="primary-action">เปิด Checklist</Link>
        </div>
      </section>

      {canSwitch ? (
        <form className="staff-switch" method="get">
          <label htmlFor="staff">ดูมุมมองของพนักงาน</label>
          <select id="staff" name="staff" defaultValue={selectedCode}>
            {employeeDirectory.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.displayName} ({entry.employmentType === "full_time" ? "Full" : "Part"})
              </option>
            ))}
          </select>
          <button type="submit">ดู</button>
        </form>
      ) : null}

      {row ? <StaffScoreCard row={row} periodLabel={reviewPeriod().label} /> : null}

      <MyShiftToday staffCode={selectedCode} branch={branch} workDate={workDate} />

      <MyAssignedWork staffCode={selectedCode} branch={branch} workDate={workDate} />

      {/* งานโปรเจกต์ (หลายวัน) — ขึ้นตรงนี้ด้วยเพื่อเตือนให้ลง progress ของวันนี้ก่อนกลับ */}
      <section className="section-heading">
        <p className="eyebrow">งานที่มอบหมาย</p>
        <h3>งานที่มอบหมาย (เดี่ยว / กลุ่ม)</h3>
      </section>
      <MyProjects branch={branch} staffCode={selectedCode} today={workDate} readOnly={user.isImpersonating} />

      <DashboardChecklistStatus phases={cardStoreWorkflow} staffCode={selectedCode} branch={branch} />
      <DashboardTaskSections
        phases={cardStoreWorkflow}
        assignedWorkRecords={assignedWorkRecords}
        assignedWorkFeed={assignedWorkFeed}
        workDate={workDate}
        canManageAssignedWork={false}
        staffCode={selectedCode}
        branch={branch}
      />
    </main>
  );
}
