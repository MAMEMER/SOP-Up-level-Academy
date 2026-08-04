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

describe("owner-written rules", () => {
  it("keeps a custom rule with its rate and category", () => {
    const rules = mergeKpiRules({
      customRules: [
        { id: "lock-case", label: "ลืมล็อกตู้การ์ด", category: "checklist", points: 3, note: "ตอนปิดร้าน" },
        { id: "bonus", label: "ช่วยกะอื่น", category: "assigned_work", points: -2 }
      ]
    });

    assert.equal(rules.customRules.length, 2);
    assert.equal(rules.customRules[0].points, 3);
    assert.equal(rules.customRules[1].points, -2);
    // built-in rates are untouched by a custom rule
    assert.equal(rules.checklist.lateSubmit, defaultKpiRules.checklist.lateSubmit);
  });

  it("drops a nameless or unnumbered custom rule instead of storing it", () => {
    const rules = mergeKpiRules({
      customRules: [
        { id: "a", label: "   ", category: "checklist", points: 3 },
        { id: "b", label: "ของจริง", category: "checklist", points: Number.NaN }
      ] as never
    });

    assert.equal(rules.customRules.length, 0);
  });

  it("has no custom rules by default", () => {
    assert.deepEqual(mergeKpiRules(null).customRules, []);
  });
});

describe("incentive ladder", () => {
  it("picks the first tier the score reaches, highest first", () => {
    const rules = mergeKpiRules({
      incentive: {
        tiers: [
          { min: 0, percent: 0, label: "ต่ำกว่า 70" },
          { min: 95, percent: 120, label: "95+" },
          { min: 70, percent: 40, label: "70-94" }
        ]
      }
    });

    // stored sorted high → low, and a % above 100 is clamped
    assert.deepEqual(rules.incentive.tiers.map((tier) => tier.min), [95, 70, 0]);
    assert.equal(getIncentiveTier(100, rules).percent, 100);
    assert.equal(getIncentiveTier(80, rules).percent, 40);
    assert.equal(getIncentiveTier(69, rules).percent, 0);
    // a 0% tier is what flags coaching
    assert.equal(getIncentiveTier(69, rules).requiresCoaching, true);
    assert.equal(getIncentiveTier(80, rules).requiresCoaching, false);
  });

  it("keeps the built-in ladder when the override is unusable", () => {
    const rules = mergeKpiRules({ incentive: { tiers: [{ min: Number.NaN, percent: 50, label: "x" }] } } as never);

    assert.deepEqual(rules.incentive.tiers, defaultKpiRules.incentive.tiers);
  });

  it("names a tier that was saved without a label", () => {
    const rules = mergeKpiRules({ incentive: { tiers: [{ min: 42, percent: 30, label: "" }] } });

    assert.equal(rules.incentive.tiers[0].label, "42 ขึ้นไป");
  });
});
