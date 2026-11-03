import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateEmployeePerformanceScore } from "../lib/performance-score.ts";
import {
  attendanceCounts,
  buildDetailCsv,
  buildSummaryCsv,
  describeDeduction,
  extractDate
} from "../lib/performance-score-csv.ts";

// A full-time staffer (Boom) with: a 7-min late, a missing clock-in, and one uncounted
// stock day — enough to exercise every CSV path and the reconciliation invariant.
function sampleRow() {
  const farFuture = Date.parse("2027-01-01T00:00:00+07:00");
  return calculateEmployeePerformanceScore({
    employeeName: "Boom",
    employmentType: "full_time",
    daysWorked: 2,
    now: farFuture,
    attendance: {
      schedules: [
        { employeeName: "Boom", workDate: "2026-11-04", scheduledStart: "2026-11-04T11:00:00+07:00", scheduledEnd: "2026-11-04T20:00:00+07:00", shiftLabel: "s1", source: "live" },
        { employeeName: "Boom", workDate: "2026-11-09", scheduledStart: "2026-11-09T11:00:00+07:00", scheduledEnd: "2026-11-09T20:00:00+07:00", shiftLabel: "s1", source: "live" }
      ],
      clockEvents: [
        { employeeName: "Boom", workDate: "2026-11-04", clockIn: "2026-11-04T11:07:00+07:00", source: "live" }
      ]
    },
    stockCounts: [
      {
        employeeName: "Boom",
        owner: "Boom",
        category: "ตู้เย็น",
        countType: "weekly",
        dueDate: "2026-11-09",
        expectedQuantity: 0,
        actualQuantity: 0,
        discrepancyStatus: "not_counted",
        source: "manual"
      }
    ],
    checklistEvents: [],
    serviceEvents: [],
    assignedWorks: []
  });
}

describe("performance score CSV", () => {
  it("extractDate pulls the first ISO date or returns empty", () => {
    assert.equal(extractDate("Boom late 7 minutes on 2026-11-04"), "2026-11-04");
    assert.equal(extractDate("ตู้เย็น has StoreHub Difference"), "");
  });

  it("describeDeduction renders a Thai late label with its minutes and date", () => {
    const row = sampleRow();
    const late = row.deductions.find((deduction) => deduction.reason === "late_within_10_minutes");
    assert.ok(late);
    const described = describeDeduction(late!);
    assert.equal(described.item, "สาย 7 นาที");
    assert.equal(described.date, "2026-11-04");
    assert.equal(described.category, "การเข้างาน");
  });

  it("attendanceCounts splits late buckets and totals them", () => {
    const counts = attendanceCounts(sampleRow());
    assert.equal(counts.late1to10, 1);
    assert.equal(counts.lateOver10, 0);
    assert.equal(counts.noClockIn, 1);
    assert.equal(counts.totalLate, 2);
  });

  it("summary CSV has a BOM, header, and one data row carrying the score", () => {
    const row = sampleRow();
    const csv = buildSummaryCsv([row], { month: "2026-11", daysWorkedByCode: { Boom: 2 } });
    assert.ok(csv.startsWith("﻿"), "starts with UTF-8 BOM");
    const lines = csv.trim().split("\r\n");
    assert.equal(lines.length, 2);
    assert.ok(lines[0].includes("คะแนนรวม"));
    assert.ok(lines[1].includes("Boom"));
    assert.ok(lines[1].includes(String(row.totalScore)));
    // วันทำงาน column present
    assert.ok(lines[1].includes(",2,"));
  });

  it("detail CSV points reconcile with the points the person lost in the summary", () => {
    const row = sampleRow();
    const detail = buildDetailCsv([row], { month: "2026-11", daysWorkedByCode: { Boom: 2 } });
    const lines = detail.trim().split("\r\n").slice(1); // drop header
    // คะแนนที่หัก is column index 7 (0-based) — no field here contains a comma, so a plain split works.
    const detailSum = lines.reduce((sum, line) => sum + Number(line.split(",")[7]), 0);
    const ledgerSum = row.deductions.reduce((sum, deduction) => sum + deduction.points, 0);
    assert.equal(detailSum, ledgerSum);
    assert.ok(ledgerSum > 0);
  });
});
