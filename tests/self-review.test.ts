import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSelfReview, groupOffences, reasonAdvice, reasonLabel, topLateChecklistPhase } from "../lib/self-review.ts";
import type { DeductionRecord, EmployeePerformanceScore } from "../lib/performance-score.ts";

function deduction(over: Partial<DeductionRecord> & Pick<DeductionRecord, "category" | "points" | "reason">): DeductionRecord {
  return { detail: "", source: "live", ...over };
}

function score(over: Partial<EmployeePerformanceScore> = {}): EmployeePerformanceScore {
  const category = (value: number) => ({ score: value, maxScore: 20, deductions: [], flags: [], warnings: [] });
  return {
    employeeName: "ICE",
    totalScore: 82,
    hasData: true,
    incentive: { label: "80-89", percent: 80, requiresCoaching: false },
    adjustmentPoints: 0,
    categories: {
      attendance: category(18),
      stock: category(20),
      checklist: category(14),
      customerService: category(20),
      assignedWork: category(19)
    },
    deductions: [],
    flags: [],
    warnings: [],
    leaveSummary: { sickUsed: 0, sickAllowance: 30, sickRemaining: 30, personalUsed: 0, personalAllowance: 3, personalRemaining: 3, records: [] },
    salaryDeduction: { amount: 0, employmentType: "full_time", pointsShort: 0, basis: "" },
    ...over
  };
}

describe("แยกได้/เสียคะแนน", () => {
  it("รายการที่คืนคะแนน (points ติดลบ) นับเป็น 'ได้' ไม่ใช่ 'เสีย'", () => {
    const review = buildSelfReview(
      score({
        deductions: [
          deduction({ category: "checklist", points: 2, reason: "late_submit", detail: "ส่งช้า x2" }),
          deduction({ category: "assigned_work", points: -1, reason: "manual_credit", detail: "คืน 1 คะแนน (2026-08-10) — หักผิด" })
        ]
      })
    );
    assert.equal(review.gains.length, 1);
    assert.equal(review.gains[0].points, 1);
    assert.equal(review.losses.length, 1);
    assert.equal(review.losses[0].points, -2);
    assert.equal(review.gainedPoints, 1);
    assert.equal(review.lostPoints, 2);
  });

  it("คะแนนที่ได้คืนไม่ถูกนับเป็นเรื่องที่ต้องแก้", () => {
    const offences = groupOffences([
      deduction({ category: "assigned_work", points: -1, reason: "manual_credit" }),
      deduction({ category: "attendance", points: 1, reason: "late_within_10_minutes" })
    ]);
    assert.deepEqual(offences.map((item) => item.reason), ["late_within_10_minutes"]);
  });
});

describe("เรื่องที่โดนซ้ำ", () => {
  it("รวมเหตุผลเดียวกันเป็นก้อนเดียว นับครั้ง + รวมคะแนน แล้วเรียงจากเสียมากสุด", () => {
    const offences = groupOffences([
      deduction({ category: "attendance", points: 1, reason: "late_within_10_minutes" }),
      deduction({ category: "attendance", points: 1, reason: "late_within_10_minutes" }),
      deduction({ category: "attendance", points: 1, reason: "late_within_10_minutes" }),
      deduction({ category: "checklist", points: 5, reason: "missing_day" }),
      deduction({ category: "stock", points: 2, reason: "stock_slow_count" })
    ]);
    assert.deepEqual(
      offences.map((item) => [item.reason, item.times, item.points]),
      [
        ["missing_day", 1, 5],
        ["late_within_10_minutes", 3, 3],
        ["stock_slow_count", 1, 2]
      ]
    );
  });

  it("เรื่องเดียวกันคนละหมวดไม่ถูกรวมเข้าด้วยกัน", () => {
    const offences = groupOffences([
      deduction({ category: "customer_service", points: 2, reason: "feedback_repeated" }),
      deduction({ category: "assigned_work", points: 2, reason: "needs_revision" })
    ]);
    assert.equal(offences.length, 2);
  });

  it("ทุกเรื่องมีคำแนะนำที่ลงมือได้ ไม่ปล่อยว่าง", () => {
    const offences = groupOffences([
      deduction({ category: "checklist", points: 5, reason: "missing_day" }),
      deduction({ category: "checklist", points: 1, reason: "reason_ที่ยังไม่รู้จัก" })
    ]);
    for (const offence of offences) assert.ok(offence.advice.length > 10, offence.reason);
    assert.equal(reasonLabel("missing_day"), "ไม่ได้ส่ง checklist ทั้งวัน");
    assert.match(reasonAdvice("missing_day"), /ส่ง checklist/);
  });
});

describe("คำแนะนำเรื่องเวลา", () => {
  it("หัวข้อที่ส่งช้าบ่อยสุดถูกใส่ในคำแนะนำพร้อมเวลาที่ต้องส่ง", () => {
    const late = topLateChecklistPhase(
      [{ phaseId: "close-store" }, { phaseId: "close-store" }, { phaseId: "open-store" }],
      (phaseId) => (phaseId === "close-store" ? { title: "ปิดร้าน", dueLabel: "22:00" } : { title: "เปิดร้าน", dueLabel: "15:30" })
    );
    assert.deepEqual(late, { phaseId: "close-store", title: "ปิดร้าน", times: 2, dueLabel: "22:00" });

    const offences = groupOffences([deduction({ category: "checklist", points: 2, reason: "late_submit" })], { lateChecklist: late });
    assert.match(offences[0].advice, /ปิดร้าน/);
    assert.match(offences[0].advice, /22:00/);
    assert.equal(offences[0].dueLabel, "22:00");
  });

  it("หัวข้อที่ถูกลบไปแล้วถูกข้าม ไม่ทำให้ทั้งบล็อกหาย", () => {
    const late = topLateChecklistPhase(
      [{ phaseId: "phase-ที่ถูกลบ" }, { phaseId: "phase-ที่ถูกลบ" }, { phaseId: "open-store" }],
      (phaseId) => (phaseId === "open-store" ? { title: "เปิดร้าน", dueLabel: "15:30" } : null)
    );
    assert.equal(late?.phaseId, "open-store");
  });

  it("ไม่มีหัวข้อที่ช้าเลย → null", () => {
    assert.equal(topLateChecklistPhase([], () => ({ title: "เปิดร้าน", dueLabel: "15:30" })), null);
  });
});

describe("สรุปหน้าแรก", () => {
  it("บอกชัดว่าเสียคะแนนมากสุดจากเรื่องไหน กี่ครั้ง", () => {
    const review = buildSelfReview(
      score({
        totalScore: 74,
        deductions: [
          deduction({ category: "checklist", points: 5, reason: "missing_day" }),
          deduction({ category: "checklist", points: 5, reason: "missing_day" }),
          deduction({ category: "attendance", points: 1, reason: "late_within_10_minutes" })
        ]
      })
    );
    assert.match(review.headline, /74\/100/);
    assert.match(review.headline, /ไม่ได้ส่ง checklist ทั้งวัน/);
    assert.match(review.headline, /2 ครั้ง/);
    assert.equal(review.focus.length, 2);
  });

  it("ไม่มีรายการหัก → ข้อความชมแทนที่จะเป็นตารางว่าง", () => {
    const review = buildSelfReview(score({ totalScore: 100, deductions: [] }));
    assert.match(review.headline, /ยังไม่โดนหัก/);
    assert.deepEqual(review.focus, []);
  });

  it("ยังไม่มีข้อมูลรอบนี้ → บอกว่าคะแนนจะเริ่มนับเมื่อไร", () => {
    const review = buildSelfReview(score({ hasData: false, deductions: [] }));
    assert.match(review.headline, /ยังไม่มีข้อมูล/);
  });

  it("คะแนนรายหมวดบอกด้วยว่าหมวดนั้นเสียไปเท่าไร", () => {
    const review = buildSelfReview(
      score({
        deductions: [
          deduction({ category: "checklist", points: 5, reason: "missing_day" }),
          deduction({ category: "checklist", points: 1, reason: "late_submit" })
        ]
      })
    );
    const checklist = review.categories.find((item) => item.key === "checklist");
    assert.equal(checklist?.lostPoints, 6);
    assert.equal(checklist?.score, 14);
    assert.equal(review.categories.find((item) => item.key === "stock")?.lostPoints, 0);
  });
});

describe("จำนวนครั้งจริง", () => {
  it("รายการที่รวมหลายครั้งไว้แล้ว (count) นับตามจริง ไม่ใช่ 1", () => {
    const offences = groupOffences([
      deduction({ category: "checklist", points: 28, reason: "late_submit", detail: "ส่ง checklist ช้า x 28 หัวข้อ", count: 28 }),
      deduction({ category: "checklist", points: 10, reason: "missing_day", detail: "ขาด checklist ทั้งวัน", count: 2 })
    ]);
    assert.deepEqual(
      offences.map((item) => [item.reason, item.times, item.points]),
      [
        ["late_submit", 28, 28],
        ["missing_day", 2, 10]
      ]
    );
  });

  it("รายการที่ไม่มี count ยังนับ 1 ต่อบรรทัดเหมือนเดิม", () => {
    const offences = groupOffences([
      deduction({ category: "attendance", points: 1, reason: "late_within_10_minutes" }),
      deduction({ category: "attendance", points: 1, reason: "late_within_10_minutes" })
    ]);
    assert.equal(offences[0].times, 2);
  });
});
