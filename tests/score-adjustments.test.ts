import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildScoreAdjustment, scoreAdjustmentsToRecords, totalAdjustmentPoints } from "../lib/score-adjustments.ts";
import { calculateEmployeePerformanceScore } from "../lib/performance-score.ts";

const baseInput = {
  employeeName: "ICE",
  employmentType: "part_time" as const,
  daysWorked: 20,
  attendance: {
    schedules: [
      {
        employeeName: "ICE",
        workDate: "2026-08-03",
        scheduledStart: "2026-08-03T11:00:00+07:00",
        scheduledEnd: "2026-08-03T20:00:00+07:00",
        shiftLabel: "s1",
        source: "google-sheet" as const
      }
    ],
    clockEvents: [{ employeeName: "ICE", workDate: "2026-08-03", clockIn: "2026-08-03T11:00:00+07:00", source: "storehub" as const }],
    leaveRecords: []
  },
  stockCounts: [],
  serviceEvents: [],
  assignedWorks: []
};

describe("owner score adjustments", () => {
  it("gives points back on the total, with the reason kept in the breakdown", () => {
    const withMiss = calculateEmployeePerformanceScore({
      ...baseInput,
      checklistEvents: [{ type: "missing_day", count: 1, dates: ["2026-08-03"], source: "google-sheet" }]
    });
    assert.equal(withMiss.totalScore, 90);
    assert.equal(withMiss.adjustmentPoints, 0);

    const corrected = calculateEmployeePerformanceScore({
      ...baseInput,
      checklistEvents: [{ type: "missing_day", count: 1, dates: ["2026-08-03"], source: "google-sheet" }],
      adjustments: [{ category: "checklist", points: 10, reason: "ระบบยังไม่เปิดให้ส่งวันนั้น", workDate: "2026-08-03" }]
    });

    assert.equal(corrected.totalScore, 100);
    assert.equal(corrected.adjustmentPoints, 10);
    const line = corrected.deductions.find((deduction) => deduction.reason === "manual_credit");
    assert.ok(line);
    assert.equal(line?.points, -10);
    assert.match(line?.detail || "", /ระบบยังไม่เปิดให้ส่งวันนั้น/);
  });

  it("can also take points away, and that reaches the salary deduction", () => {
    const docked = calculateEmployeePerformanceScore({
      ...baseInput,
      checklistEvents: [],
      adjustments: [{ category: "customer_service", points: -60, reason: "เคสร้องเรียนรุนแรง", workDate: "2026-08-03" }]
    });

    assert.equal(docked.totalScore, 40);
    assert.equal(docked.salaryDeduction.pointsShort, 10);
    assert.ok(docked.salaryDeduction.amount > 0);
  });

  it("never pushes a score outside 0-100", () => {
    const over = calculateEmployeePerformanceScore({
      ...baseInput,
      checklistEvents: [],
      adjustments: [{ category: "stock", points: 40, reason: "โบนัสพิเศษ", workDate: "2026-08-03" }]
    });
    const under = calculateEmployeePerformanceScore({
      ...baseInput,
      checklistEvents: [],
      adjustments: [{ category: "stock", points: -400, reason: "เคสร้ายแรง", workDate: "2026-08-03" }]
    });

    assert.equal(over.totalScore, 100);
    assert.equal(under.totalScore, 0);
  });

  it("keeps the reason and the signed points on the stored record", () => {
    const record = buildScoreAdjustment(
      { workDate: "2026-08-03", employeeName: "ICE", category: "checklist", points: 2.4, reason: "  หักผิด  ", recordedBy: "champ.championest@gmail.com" },
      "2026-08-03T12:00:00.000Z"
    );

    assert.equal(record.points, 2);
    assert.equal(record.reason, "หักผิด");
    assert.equal(totalAdjustmentPoints([record]), 2);
    assert.equal(scoreAdjustmentsToRecords([record])[0].points, -2);
  });
});
