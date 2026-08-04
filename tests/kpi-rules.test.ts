import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateAssignedWorkScore,
  calculateChecklistScore,
  calculateCustomerServiceScore,
  calculateSalaryDeduction,
  calculateStockScore,
  getIncentiveTier
} from "../lib/performance-score.ts";
import { defaultKpiRules, kpiRuleRows, mergeKpiRules, overrideFromRows } from "../lib/kpi-rules.ts";

describe("KPI rulebook", () => {
  it("scores exactly as before when nothing is overridden", () => {
    const rules = mergeKpiRules(null);

    assert.equal(calculateChecklistScore([{ type: "late_submit", count: 1, source: "manual" }], rules).score, 18);
    assert.equal(calculateChecklistScore([{ type: "false_record", count: 1, source: "manual" }], rules).score, 10);
    assert.equal(calculateCustomerServiceScore([{ bucket: "feedback", severity: "fixed_immediately", count: 1, source: "manual" }], rules).score, 15);
    assert.equal(calculateAssignedWorkScore([{ title: "x", status: "not_finished", source: "manual" }], rules).score, 15);
    assert.equal(getIncentiveTier(85, rules).percent, 80);
    assert.equal(calculateSalaryDeduction(45, { employmentType: "full_time" }).amount, 2500);
  });

  it("uses the owner's retuned rates", () => {
    const rules = mergeKpiRules({
      checklist: { lateSubmit: 5 },
      customerService: { fixedImmediately: 2 },
      salary: { fullTimeRatePerPoint: 1000, threshold: 60 }
    });

    assert.equal(calculateChecklistScore([{ type: "late_submit", count: 2, source: "manual" }], rules).score, 10);
    assert.equal(calculateCustomerServiceScore([{ bucket: "feedback", severity: "fixed_immediately", count: 1, source: "manual" }], rules).score, 18);
    // threshold 60 → 45 is 15 points short → 15 × 1000
    const salary = calculateSalaryDeduction(45, {
      employmentType: "full_time",
      threshold: rules.salary.threshold,
      fullTimeRatePerPoint: rules.salary.fullTimeRatePerPoint
    });
    assert.equal(salary.pointsShort, 15);
    assert.equal(salary.amount, 15000);
    // untouched groups keep their defaults
    assert.equal(rules.stock.notCountedFirst, defaultKpiRules.stock.notCountedFirst);
  });

  it("retunes the stock escalation ladder", () => {
    const rules = mergeKpiRules({ stock: { notCountedFirst: 4, notCountedAfter: 1, notCountedEscalateAfter: 1 } });
    const counts = ["2026-08-01", "2026-08-02", "2026-08-03"].map((dueDate) => ({
      employeeName: "ICE",
      owner: "ICE",
      category: "Sleeve",
      countType: "weekly" as const,
      dueDate,
      submittedAt: dueDate,
      expectedQuantity: 0,
      actualQuantity: 0,
      discrepancyStatus: "not_counted" as const,
      resolvedWithin24Hours: false,
      slowCount: false,
      source: "manual" as const
    }));

    // 4 + 1 + 1 = 6 deducted from 20
    assert.equal(calculateStockScore(counts, rules).score, 14);
  });

  it("ignores a broken or negative value instead of zeroing a rule", () => {
    const rules = mergeKpiRules({
      checklist: { falseRecord: Number.NaN, lateSubmit: -5 },
      categoryMax: 0
    } as never);

    assert.equal(rules.checklist.falseRecord, defaultKpiRules.checklist.falseRecord);
    assert.equal(rules.checklist.lateSubmit, defaultKpiRules.checklist.lateSubmit);
    assert.equal(rules.categoryMax, defaultKpiRules.categoryMax);
  });

  it("round-trips the owner form back into an override", () => {
    const rows = kpiRuleRows(defaultKpiRules);
    const override = overrideFromRows([
      { path: "checklist.lateSubmit", value: 3 },
      { path: "categoryMax", value: 25 }
    ]);

    assert.ok(rows.some((row) => row.path === "checklist.lateSubmit"));
    assert.equal(mergeKpiRules(override).checklist.lateSubmit, 3);
    assert.equal(mergeKpiRules(override).categoryMax, 25);
  });
});
