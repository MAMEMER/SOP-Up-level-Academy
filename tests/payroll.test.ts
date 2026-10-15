import test from "node:test";
import assert from "node:assert/strict";
import {
  computePayLine,
  defaultOtRate,
  otForDay,
  otHours,
  payrollCsv,
  payrollTotals,
  periodFor,
  periodIdForDate,
  shiftPeriod,
  validateAdjustment,
  validateProfile,
  type PayAdjustment,
  type PayInputs
} from "../lib/payroll.ts";

const adj = (amount: number, extra: Partial<PayAdjustment> = {}): PayAdjustment => ({
  id: String(Math.random()),
  code: "UP-003",
  periodId: "2026-10-A",
  kind: "other",
  amount,
  reason: "ทดสอบ",
  createdAt: "2026-10-10T00:00:00Z",
  createdBy: "champ",
  ...extra
});

const base = (over: Partial<PayInputs> = {}): PayInputs => ({
  code: "UP-003",
  name: "บูม",
  directoryType: "full_time",
  scheduledDates: [],
  clockIns: [],
  kpi: null,
  adjustments: [],
  shiftHours: 9,
  ...over
});

test("half-month periods: A = 1–15, B = 16–month end, stepping across years", () => {
  assert.deepEqual(periodFor("2026-02-B"), { id: "2026-02-B", label: "16–28 ก.พ. 2026", startDate: "2026-02-16", endDate: "2026-02-28" });
  assert.equal(periodFor("2026-10-A")!.endDate, "2026-10-15");
  assert.equal(periodFor("2026-13-A"), null);
  assert.equal(periodIdForDate("2026-10-15"), "2026-10-A");
  assert.equal(periodIdForDate("2026-10-16"), "2026-10-B");
  assert.equal(shiftPeriod("2026-12-B", 1), "2027-01-A");
  assert.equal(shiftPeriod("2026-01-A", -1), "2025-12-B");
  assert.equal(shiftPeriod("2026-10-A", 1), "2026-10-B");
});

test("full-time: half the salary, minus the KPI deduction the score system already computed, plus adjustments", () => {
  const line = computePayLine(
    base({
      profile: { code: "UP-003", type: "full_time", monthlySalary: 15000 },
      kpi: { score: 47.5, hasData: true, deduction: 1500, pointsShort: 3 },
      adjustments: [adj(500, { kind: "bonus" }), adj(-200, { kind: "deduction" }), adj(9999, { voided: true })]
    })
  );
  assert.equal(line.base, 7500);
  assert.equal(line.kpiDeduction, 1500);
  assert.equal(line.adjustmentTotal, 300);
  assert.equal(line.net, 7500 - 1500 + 300);
  assert.equal(line.configured, true);
  assert.match(line.kpiText, /ขาด 3/);
});

test("part-time: daily rate × days with a clock-in; scheduled-but-no-clock-in days are flagged, not paid", () => {
  const line = computePayLine(
    base({
      directoryType: "part_time",
      profile: { code: "UP-004", type: "part_time", dailyRate: 450 },
      scheduledDates: ["2026-10-01", "2026-10-02", "2026-10-03"],
      clockIns: [{ date: "2026-10-01" }, { date: "2026-10-02" }, { date: "2026-10-05" }]
    })
  );
  assert.equal(line.daysWorked, 3);
  assert.equal(line.base, 1350);
  assert.deepEqual(line.missedDates, ["2026-10-03"]);
  assert.deepEqual(line.extraDates, ["2026-10-05"]);
  assert.ok(line.warnings.some((w) => w.includes("ไม่มีตอกบัตร")));
});

test("missing salary/rate is reported instead of silently paying 0; no KPI data = no deduction", () => {
  const line = computePayLine(base({ kpi: { score: 0, hasData: false, deduction: 999, pointsShort: 50 } }));
  assert.equal(line.configured, false);
  assert.equal(line.kpiDeduction, 0);
  assert.equal(line.kpiScore, null);
  assert.ok(line.warnings.includes("ยังไม่ได้ตั้งเงินเดือน"));
  assert.equal(payrollTotals([line]).unconfigured, 1);
});

test("OT is only suggested from clock-in/out, in half hours, and disappears once approved as an adjustment", () => {
  assert.equal(otHours(9.4, 9), 0);
  assert.equal(otHours(10.7, 9), 1.5);
  assert.equal(otHours(null, 9), 0);
  assert.equal(defaultOtRate("full_time", { code: "x", type: "full_time", monthlySalary: 15000 }), 93.75);
  assert.equal(defaultOtRate("part_time", { code: "x", type: "part_time", dailyRate: 400, otRatePerHour: 80 }), 80);

  assert.deepEqual(otForDay({ date: "d", clockIn: "08:30", clockOut: "21:10", hours: 12.7, scheduledEnd: "20:00" }, 9), { hours: 1, suspect: false });
  assert.deepEqual(otForDay({ date: "d", clockIn: "08:00", clockOut: "20:00", hours: 12, scheduledEnd: "20:00" }, 9), { hours: 0, suspect: false }, "coming early is not OT");
  assert.deepEqual(otForDay({ date: "d", clockIn: "09:00", clockOut: "23:59", hours: 38, scheduledEnd: "18:00" }, 9), { hours: 0, suspect: true });
  assert.deepEqual(otForDay({ date: "d", clockIn: "09:00", hours: null }, 9), { hours: 0, suspect: false });

  const inputs = base({
    profile: { code: "UP-003", type: "full_time", monthlySalary: 15000 },
    clockIns: [{ date: "2026-10-01", clockOut: "20:00", hours: 11 }, { date: "2026-10-02", clockOut: "18:00", hours: 9 }, { date: "2026-10-03", clockOut: "23:00", hours: 30 }]
  });
  const before = computePayLine(inputs);
  assert.equal(before.otSuggestion.hours, 2);
  assert.equal(before.otSuggestion.amount, 187.5);
  assert.equal(before.net, 7500, "suggested OT is not paid until approved");
  assert.ok(before.warnings.some((w) => w.includes("ลืมตอกออก")));

  const after = computePayLine({ ...inputs, adjustments: [adj(187.5, { kind: "ot", hours: 2 })] });
  assert.equal(after.otSuggestion.hours, 0);
  assert.equal(after.net, 7687.5);
});

test("validation: adjustments need a non-zero amount and a reason; profiles need a type", () => {
  assert.equal(validateAdjustment({ amount: 0, reason: "abc", kind: "other" }), "ใส่จำนวนเงิน (บวก = เพิ่ม, ลบ = หัก)");
  assert.equal(validateAdjustment({ amount: -300, reason: "", kind: "deduction" }), "ต้องใส่เหตุผล");
  assert.equal(validateAdjustment({ amount: -300, reason: "มาสาย", kind: "nope" }), "ประเภทไม่ถูกต้อง");
  assert.equal(validateAdjustment({ amount: -300, reason: "เบิกล่วงหน้า", kind: "advance" }), null);
  assert.equal(validateProfile({ type: "full_time", monthlySalary: 15000 }), null);
  assert.equal(validateProfile({ type: "x" }), "เลือกประเภท ประจำ / พาร์ทไทม์");
  assert.equal(validateProfile({ type: "part_time", dailyRate: -1 }), "เรทรายวันไม่ถูกต้อง");
});

test("CSV has a BOM for Excel and one row per person with signed deduction", () => {
  const line = computePayLine(base({ profile: { code: "UP-003", type: "full_time", monthlySalary: 10000 }, adjustments: [adj(-100, { reason: 'ทำของ "แตก"' })] }));
  const csv = payrollCsv(periodFor("2026-10-A")!, [line]);
  assert.ok(csv.startsWith("﻿"));
  assert.equal(csv.trim().split("\n").length, 2);
  assert.match(csv, /""แตก""/);
});
