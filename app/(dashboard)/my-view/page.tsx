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
import { fetchLateChecklistDays, fetchSubmittedChecklistDays } from "../../../lib/checklist-kpi.ts";
import { fetchAttendanceSource } from "../../../lib/planner-kpi.ts";
import { assignedWorkRecordsForDate } from "../../../lib/performance-service-records.ts";
import { assignedWorkFeedForViewer, fetchAssignedWorkFeed } from "../../../lib/assigned-work-feed.ts";
import { formatWorkDate } from "../../../lib/workflow-records.ts";
import { cardStoreWorkflow } from "../../../lib/card-store-workflow.ts";
import { resolveStaffViewSelection } from "../../../lib/staff-view.ts";
import { StaffScoreCard } from "../../../components/StaffScoreCard.tsx";
import { MyShiftToday } from "../../../components/MyShiftToday.tsx";
import { MyAssignedWork } from "../../../components/MyAssignedWork.tsx";
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
  const [dailyStore, attendance, feed, submittedChecklistDays, lateChecklistDays] = await Promise.all([
    fetchPerformanceDailyStore(),
    fetchAttendanceSource(branch),
    fetchAssignedWorkFeed(branch, workDate),
    // Without this the checklist KPI treats every scheduled+clocked-in day since go-live as a
    // missing checklist day, over-deducting the Checklist category vs. the admin view.
    fetchSubmittedChecklistDays(branch, period.startDate, period.endDate),
    // Days submitted complete but past the deadline → -1 each (ส่งครบแต่ช้า).
    fetchLateChecklistDays(branch, period.startDate, period.endDate)
  ]);

  const rows = getPerformanceScoreRows(period.id, dailyStore, attendance, submittedChecklistDays, lateChecklistDays);
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

      <DashboardChecklistStatus phases={cardStoreWorkflow} />
      <DashboardTaskSections
        phases={cardStoreWorkflow}
        assignedWorkRecords={assignedWorkRecords}
        assignedWorkFeed={assignedWorkFeed}
        workDate={workDate}
        canManageAssignedWork={false}
      />
    </main>
  );
}
