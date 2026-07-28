import type { EmployeePerformanceScore } from "../lib/performance-score.ts";
import { deductionCategoryLabel, deductionSourceLabel } from "../lib/staff-view.ts";

const categoryLabels = {
  attendance: "เข้างาน",
  stock: "Stock",
  checklist: "Checklist",
  customerService: "บริการลูกค้า",
  assignedWork: "งานที่มอบหมาย"
} as const;

// Staff-facing summary of ONE person's KPI. Deliberately omits everything that is
// owner-only on /admin/performance-score: no salary deduction, no data-source upload,
// no manual complaint/assigned-work input, no other employees' rows.
export function StaffScoreCard({ row, periodLabel }: { row: EmployeePerformanceScore; periodLabel: string }) {
  const coaching = row.flags.includes("coaching_required");

  return (
    <section className="staff-score" aria-label="คะแนนของฉัน">
      <div className="staff-score-head">
        <div>
          <p className="eyebrow">คะแนนของฉัน</p>
          <h3>ผลงานรอบ {periodLabel}</h3>
        </div>
        <span className={coaching ? "score-badge score-badge-red" : "score-badge score-badge-green"}>
          {coaching ? "Coach 4 weeks" : "OK"}
        </span>
      </div>

      <div className="staff-score-hero">
        <div className="staff-score-total">
          <strong>{row.totalScore}</strong>
          <span>/100 คะแนน</span>
        </div>
        <div className="staff-score-incentive">
          <span>Incentive</span>
          <strong>{row.incentive.percent}%</strong>
          <em>{row.incentive.label}</em>
          <small>{row.incentive.requiresCoaching ? "ต้องประเมินรายสัปดาห์" : "ผ่านเกณฑ์รอบนี้"}</small>
        </div>
      </div>

      <div className="staff-score-categories">
        {Object.entries(row.categories).map(([key, result]) => (
          <span key={key}>
            {categoryLabels[key as keyof typeof categoryLabels]}
            <strong>{result.score}/{result.maxScore}</strong>
          </span>
        ))}
      </div>

      <div className="staff-score-leave">
        <p className="eyebrow">การลาปีนี้</p>
        <div>
          <span>
            ลาป่วย
            <strong>{row.leaveSummary.sickUsed}/{row.leaveSummary.sickAllowance}</strong>
            <small>เหลือ {row.leaveSummary.sickRemaining}</small>
          </span>
          <span>
            ลากิจ
            <strong>{row.leaveSummary.personalUsed}/{row.leaveSummary.personalAllowance}</strong>
            <small>เหลือ {row.leaveSummary.personalRemaining}</small>
          </span>
        </div>
      </div>

      <div className="staff-score-deductions">
        <p className="eyebrow">เหตุผลที่ถูกหักคะแนน</p>
        {row.deductions.length ? (
          <ul>
            {row.deductions.map((deduction, index) => (
              <li key={`${deduction.reason}-${index}`}>
                <span className="staff-deduction-cat">{deductionCategoryLabel(deduction.category)}</span>
                <span className="staff-deduction-points">-{deduction.points}</span>
                <span className="staff-deduction-detail">{deduction.detail || deduction.reason}</span>
                <span className="staff-deduction-source">ที่มา: {deductionSourceLabel(deduction.source)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="staff-score-clear">ไม่มีรายการหักคะแนนในรอบนี้ ทำได้ดีมาก</p>
        )}
      </div>

      {row.leaveSummary.records.length ? (
        <div className="staff-score-leave-records">
          <p className="eyebrow">วันลาในรอบนี้ (ไม่นับหักคะแนนเข้างาน)</p>
          <div>
            {row.leaveSummary.records.map((leave) => (
              <span key={`${leave.type}-${leave.workDate}`}>
                {leave.workDate} · {leave.type === "sick" ? "ลาป่วย" : "ลากิจ"}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
