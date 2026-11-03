import { actor, forbidden } from "../../../../../lib/api-firestore.ts";
import { isOwner } from "../../../../../lib/owner.ts";
import { fetchPerformanceDailyStore } from "../../../../../lib/performance-daily-store.ts";
import { fetchAttendanceSource } from "../../../../../lib/planner-kpi.ts";
import { fetchChecklistKpiInput } from "../../../../../lib/checklist-kpi.ts";
import { getPerformanceScoreRowsForRange, type PerformanceReviewPeriod } from "../../../../../lib/performance-score-data.ts";
import { buildDetailCsv, buildSummaryCsv } from "../../../../../lib/performance-score-csv.ts";

// ดาวน์โหลดคะแนนพนักงานรายเดือนเป็น CSV — money-sensitive (เงินเดือน/incentive) จึงเปิดเฉพาะ
// เจ้าของเหมือนตัวเลขหักเงินในหน้าจอ. อ่านอย่างเดียว ไม่เขียนข้อมูล.
export const dynamic = "force-dynamic";

function bangkokMonth(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).format(date);
}

function periodForMonth(month: string): PerformanceReviewPeriod {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    id: "custom",
    label: month,
    startDate: `${month}-01`,
    endDate: `${month}-${String(lastDay).padStart(2, "0")}`
  };
}

export async function GET(request: Request) {
  const { user } = await actor();
  // The sheet carries salary deductions and incentive %, which are owner-only on the page.
  if (!isOwner(user.actualEmail)) return forbidden();

  const url = new URL(request.url);
  const monthParam = url.searchParams.get("month") || "";
  const month = /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : bangkokMonth();
  const type = url.searchParams.get("type") === "detail" ? "detail" : "summary";
  const period = periodForMonth(month);

  const dailyStore = await fetchPerformanceDailyStore();
  const attendance = await fetchAttendanceSource("bangkae");
  const checklistKpi = await fetchChecklistKpiInput("bangkae", period.startDate, period.endDate);
  const rows = getPerformanceScoreRowsForRange(
    period,
    dailyStore,
    attendance,
    checklistKpi.submittedDays,
    checklistKpi.lateSubmissions
  );

  // วันทำงาน = กะที่วางไว้ในเดือนนั้น (ชุดเดียวกับที่ engine ใช้เป็น daysWorked)
  const daysWorkedByCode: Record<string, number> = {};
  attendance.schedules.forEach((shift) => {
    if (shift.workDate >= period.startDate && shift.workDate <= period.endDate) {
      daysWorkedByCode[shift.employeeName] = (daysWorkedByCode[shift.employeeName] ?? 0) + 1;
    }
  });

  const csv = type === "detail" ? buildDetailCsv(rows, { month, daysWorkedByCode }) : buildSummaryCsv(rows, { month, daysWorkedByCode });
  const filename = type === "detail" ? `performance-score-detail-${month}.csv` : `performance-score-${month}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, max-age=0, must-revalidate"
    }
  });
}
