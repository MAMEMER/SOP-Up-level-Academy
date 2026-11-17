import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canAppeal,
  canDecide,
  deductionFor,
  monthlyGroupScores,
  occurrenceOf,
  threeMonthsBefore,
  validateMistakeDraft,
  type MistakeRecord
} from "../lib/mistake-log.ts";
import {
  coworkersOf,
  openPeriods,
  scorePeerReviews,
  validatePeerReview,
  type PeerReviewRecord
} from "../lib/peer-review.ts";

let seq = 0;
function mk(partial: Partial<MistakeRecord>): MistakeRecord {
  seq += 1;
  return {
    id: `m${seq}`,
    staffCode: "ICE",
    branch: "bangkae",
    date: "2026-12-01",
    taskCode: "1.1.5",
    level: "unintentional",
    note: "x",
    recordedBy: "boss@x.com",
    createdAt: `2026-12-01T00:00:${String(seq).padStart(2, "0")}Z`,
    ...partial
  };
}

test("unintentional: 1st free, then 3/6/12/24/30 within 3 months of the same task", () => {
  const dates = ["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06", "2026-12-07"];
  const all = dates.map((date) => mk({ date }));
  assert.deepEqual(all.map((r) => deductionFor(r, all)), [0, 3, 6, 12, 24, 30, 30]);
});

test("counts separately per task code and expires after 3 months", () => {
  const a = mk({ date: "2026-09-01" });
  const b = mk({ date: "2026-12-01" }); // 2026-09-01 is not after 2026-09-01 → expired
  const c = mk({ date: "2026-12-02", taskCode: "1.1.4" });
  const all = [a, b, c];
  assert.equal(occurrenceOf(b, all), 1);
  assert.equal(occurrenceOf(c, all), 1);
  assert.equal(threeMonthsBefore("2026-05-31"), "2026-02-28");
});

test("negligent has no free first time; intentional zeroes the group", () => {
  const n1 = mk({ level: "negligent" });
  const n2 = mk({ level: "negligent", date: "2026-12-02" });
  const all = [n1, n2];
  assert.equal(deductionFor(n1, all), 10);
  assert.equal(deductionFor(n2, all), 20);
  const scores = monthlyGroupScores([...all, mk({ level: "intentional", taskCode: "2.1.1" })], "ICE", "2026-12");
  assert.deepEqual(scores.map((s) => s.score), [70, 0]);
});

test("voided records do not count or deduct", () => {
  const v = mk({ decision: { result: "voided", by: "b@x.com", at: "2026-12-02T00:00:00Z" } });
  const r = mk({ date: "2026-12-02" });
  assert.equal(deductionFor(r, [v, r]), 0);
  assert.equal(monthlyGroupScores([v, r], "ICE", "2026-12")[0].score, 100);
});

test("appeal window 3 days, decider must differ from recorder", () => {
  const r = mk({ createdAt: "2026-12-01T10:00:00Z" });
  assert.equal(canAppeal(r, "2026-12-04T09:59:00Z"), true);
  assert.equal(canAppeal(r, "2026-12-04T10:01:00Z"), false);
  const appealed = { ...r, appeal: { text: "no", at: "2026-12-02T00:00:00Z" } };
  assert.equal(canDecide(appealed, "boss@x.com"), false);
  assert.equal(canDecide(appealed, "other@x.com"), true);
  assert.equal(validateMistakeDraft({ staffCode: "ICE", date: "2026-12-01", taskCode: "9.9", level: "negligent", note: "x" }), "เลือกรหัสงาน");
});

test("360: coworkers share a branch+day, open periods, scoring and validation", () => {
  const cells = [
    { staffCode: "A", workDate: "2026-12-01", branch: "bangkae" },
    { staffCode: "B", workDate: "2026-12-01", branch: "bangkae" },
    { staffCode: "C", workDate: "2026-12-01", branch: "senafest" },
    { staffCode: "D", workDate: "2026-11-30", branch: "bangkae" }
  ];
  assert.deepEqual(coworkersOf("A", "2026-12", cells), ["B"]);
  assert.deepEqual(openPeriods("2026-12-05"), ["2026-12", "2026-11"]);
  assert.deepEqual(openPeriods("2027-01-08"), ["2027-01"]);
  assert.deepEqual(openPeriods("2027-01-03"), ["2027-01", "2026-12"]);

  const all4 = { q1: 4, q2: 4, q3: 4, q4: 4, q5: 4, q6: 4 } as const;
  const all2 = { q1: 2, q2: 2, q3: 2, q4: 2, q5: 2, q6: 2 } as const;
  const rec = (rater: string, ratings: Record<string, 1 | 2 | 3 | 4>): PeerReviewRecord => ({
    id: rater, period: "2026-12", raterCode: rater, raterEmail: "", rateeCode: "A", ratings, examples: {}, createdAt: "", updatedAt: ""
  });
  const score = scorePeerReviews([rec("B", all4), rec("C", all2)], "A");
  assert.equal(score.raters, 2);
  assert.equal(score.score, 66.5);

  assert.match(validatePeerReview({ ratings: { ...all4 }, examples: {} }) || "", /ตัวอย่าง/);
  assert.equal(validatePeerReview({ ratings: { ...all2 }, examples: {} }), null);
  assert.match(validatePeerReview({ ratings: { q1: 2 }, examples: {} }) || "", /ยังไม่ได้ให้คะแนน/);
});

test("KPI salary deduction is abolished for periods ending on/after 2026-11-01", async () => {
  const { salaryDeductionAbolished, calculateEmployeePerformanceScore } = await import("../lib/performance-score.ts");
  assert.equal(salaryDeductionAbolished("2026-10-31"), false);
  assert.equal(salaryDeductionAbolished("2026-11-15"), true);
  assert.equal(salaryDeductionAbolished(undefined), false);
  // Manual deductions push every category to 0 → total under 50: before the cutoff it docks pay, after it does not.
  const cats = ["attendance", "stock", "checklist", "customer_service", "assigned_work"] as const;
  const input = {
    employeeName: "Boom",
    employmentType: "full_time" as const,
    daysWorked: 20,
    now: Date.parse("2027-01-01T00:00:00+07:00"),
    attendance: { schedules: [], clockEvents: [] },
    stockCounts: [],
    checklistEvents: [],
    serviceEvents: [],
    assignedWorks: [],
    adjustments: cats.map((category) => ({ category, points: -20, reason: "test", workDate: "2026-10-10" }))
  };
  const before = calculateEmployeePerformanceScore({ ...input, periodEndDate: "2026-10-31" });
  const after = calculateEmployeePerformanceScore({ ...input, periodEndDate: "2026-11-30" });
  assert.ok(before.totalScore < 50);
  assert.ok(before.salaryDeduction.amount > 0);
  assert.equal(after.salaryDeduction.amount, 0);
  assert.equal(before.totalScore, after.totalScore);
});
