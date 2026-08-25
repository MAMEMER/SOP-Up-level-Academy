import Link from "next/link";
import { CoachingNotes } from "../../../components/CoachingNotes.tsx";
import { SelfReviewBoard } from "../../../components/SelfReviewBoard.tsx";
import { StaffFeedbackPanel } from "../../../components/StaffFeedbackPanel.tsx";
import { requireUser } from "../../../lib/auth.ts";
import { branchFor, displayNameFor, employeeCodeForEmail, employeeCodes, employeeDirectory } from "../../../lib/employee-directory.ts";
import { currentReviewPeriod, getPerformanceScoreRows } from "../../../lib/performance-score-data.ts";
import { fetchChecklistKpiInput } from "../../../lib/checklist-kpi.ts";
import { fetchAttendanceSource } from "../../../lib/planner-kpi.ts";
import { fetchPerformanceDailyStore } from "../../../lib/performance-daily-store.ts";
import { fetchPhaseWindows } from "../../../lib/checklist-windows-server.ts";
import { fetchShiftAssignmentsForDate } from "../../../lib/shift-plan-server.ts";
import { cardStoreWorkflow } from "../../../lib/card-store-workflow.ts";
import { phaseScheduleForWorkDate, formatWorkDate } from "../../../lib/workflow-records.ts";
import { resolveStaffViewSelection } from "../../../lib/staff-view.ts";
import { buildSelfReview, topLateChecklistPhase } from "../../../lib/self-review.ts";

// ประเมินผลงานตัวเอง — พนักงานเปิดดูของตัวเองได้ตลอด, หัวหน้าสลับดูของแต่ละคนได้
// (กติกาการมองเห็นใช้ resolveStaffViewSelection ตัวเดียวกับหน้า "งานของฉัน").

type PageProps = { searchParams?: Promise<{ staff?: string }> };

export default async function MyReviewPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const isOwner = user.role === "admin";
  const params = searchParams ? await searchParams : {};
  const { selectedCode, canSwitch } = resolveStaffViewSelection({
    isOwner,
    selfCode: employeeCodeForEmail(user.email),
    requestedCode: params.staff,
    validCodes: employeeCodes
  });

  if (!selectedCode) {
    return (
      <main className="page">
        <Link href="/" className="back-link">← กลับ Dashboard</Link>
        <section className="board-hero">
          <div>
            <p className="eyebrow">ประเมินผลงานตัวเอง</p>
            <h2>ผลงานของฉัน</h2>
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
  const period = currentReviewPeriod();

  const [dailyStore, attendance, checklistKpi, windows, shifts] = await Promise.all([
    fetchPerformanceDailyStore(),
    fetchAttendanceSource(branch),
    fetchChecklistKpiInput(branch, period.startDate, period.endDate),
    fetchPhaseWindows(branch),
    fetchShiftAssignmentsForDate(branch, workDate)
  ]);

  const rows = getPerformanceScoreRows(period.id, dailyStore, attendance, checklistKpi.submittedDays, checklistKpi.lateSubmissions);
  const row = rows.find((item) => item.employeeName === selectedCode);

  // หัวข้อ checklist ที่คนนี้ส่งช้าบ่อยสุด + เวลาที่ต้องส่งจริงของหัวข้อนั้น (ตามกะที่ลงไว้วันนี้)
  const shift = shifts?.get(selectedCode) ?? null;
  const lateChecklist = topLateChecklistPhase(
    checklistKpi.lateSubmissions.filter((item) => item.employeeName === selectedCode),
    (phaseId) => {
      const phase = cardStoreWorkflow.find((item) => item.id === phaseId);
      if (!phase) return null;
      return { title: phase.title, dueLabel: phaseScheduleForWorkDate(phaseId, workDate, { windows, shift }).dueLabel };
    }
  );

  const review = row ? buildSelfReview(row, { lateChecklist }) : null;

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">ประเมินผลงานตัวเอง</p>
          <h2>ผลงานของ {displayNameFor(selectedCode)}</h2>
          <p>ดูว่ารอบนี้ได้และเสียคะแนนไปกับงานไหน เรื่องไหนโดนซ้ำบ่อยที่สุด และต้องแก้อะไรก่อน</p>
        </div>
        <div className="hero-actions">
          <Link href="/my-view" className="primary-action">ไปหน้างานของฉัน</Link>
        </div>
      </section>

      {canSwitch ? (
        <form className="staff-switch" method="get">
          <label htmlFor="staff">ดูผลงานของพนักงาน</label>
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

      {/* คำแนะนำจากหัวหน้า — เจ้าของเขียนถึงคนที่กำลังเปิดดูอยู่ พนักงานเห็นของตัวเองพร้อมรูป */}
      <CoachingNotes
        staffCode={selectedCode}
        staffName={displayNameFor(selectedCode)}
        branch={branch}
        period={period.startDate.slice(0, 7)}
        isAdmin={isOwner}
        readOnly={user.isImpersonating}
      />

      {/* เสียงจากสมาชิก (ชม/แนะนำ/ติ) ที่ส่งมาจากเว็บกิลด์ — ไม่ผูกกับคะแนน */}
      <StaffFeedbackPanel staffCode={selectedCode} isAdmin={isOwner} readOnly={user.isImpersonating} />

      {review ? (
        <SelfReviewBoard review={review} periodLabel={period.label} />
      ) : (
        <section className="staff-empty">
          <p>ยังไม่มีคะแนนของรอบนี้ — คะแนนจะเริ่มนับเมื่อขึ้นตารางกะและเริ่มส่งงาน</p>
        </section>
      )}
    </main>
  );
}
