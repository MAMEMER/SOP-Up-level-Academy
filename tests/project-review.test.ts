import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assigneeStatus,
  computeReviewPoints,
  effectiveDue,
  hasOpenRevision,
  netReviewPoints,
  projectReviewsToAdjustments,
  reviewEntriesFor
} from "../lib/project-review.ts";
import type { ProjectReviewEntry, WorkProject } from "../lib/work-projects.ts";

function baseProject(over: Partial<WorkProject> = {}): WorkProject {
  return {
    id: "wp-1",
    branch: "bangkae",
    title: "นับ Stock",
    startDate: "2026-08-10",
    endDate: "2026-08-17",
    assignees: ["ICE", "Boom"],
    status: "active",
    mode: "group",
    createdBy: "owner@x.com",
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    progress: [],
    reviews: [],
    ...over
  };
}

function entry(over: Partial<ProjectReviewEntry> & Pick<ProjectReviewEntry, "assignee" | "outcome" | "points">): ProjectReviewEntry {
  return {
    id: `rv-${over.assignee}-${over.outcome}-${over.confirmedAt ?? "t"}`,
    dueDate: "2026-08-17",
    daysLate: 0,
    confirmedBy: "owner@x.com",
    confirmedAt: "2026-08-17T09:00:00.000Z",
    ...over
  };
}

describe("computeReviewPoints — กติกาคะแนนงานที่มอบหมาย", () => {
  it("เสร็จก่อนกำหนด ไม่ต้องแก้ → +1", () => {
    const r = computeReviewPoints({ verdict: "approve", dueDate: "2026-08-17", submittedDate: "2026-08-16", hadRevision: false });
    assert.equal(r.outcome, "early_pass");
    assert.equal(r.points, 1);
    assert.equal(r.daysLate, 0);
  });

  it("เสร็จตรงเวลา ไม่ต้องแก้ → 0", () => {
    const r = computeReviewPoints({ verdict: "approve", dueDate: "2026-08-17", submittedDate: "2026-08-17", hadRevision: false });
    assert.equal(r.outcome, "ontime_pass");
    assert.equal(r.points, 0);
  });

  it("สั่งให้แก้ไข → −1 ทันที", () => {
    const r = computeReviewPoints({ verdict: "request_fix", dueDate: "2026-08-17", hadRevision: false });
    assert.equal(r.outcome, "needs_fix");
    assert.equal(r.points, -1);
  });

  it("แก้ทันกำหนดใหม่ แล้วผ่าน → +1 คืน (สุทธิ 0)", () => {
    const r = computeReviewPoints({ verdict: "approve", dueDate: "2026-08-20", submittedDate: "2026-08-20", hadRevision: true });
    assert.equal(r.outcome, "fixed_pass");
    assert.equal(r.points, 1);
  });

  it("ช้ากว่ากำหนด 2 วัน → −6", () => {
    const r = computeReviewPoints({ verdict: "approve", dueDate: "2026-08-17", submittedDate: "2026-08-19", hadRevision: false });
    assert.equal(r.outcome, "late");
    assert.equal(r.daysLate, 2);
    assert.equal(r.points, -6);
  });

  it("ช้าแม้เคยสั่งแก้ (แก้ไม่ทันกำหนดใหม่) → คิดช้าจากกำหนดใหม่", () => {
    const r = computeReviewPoints({ verdict: "approve", dueDate: "2026-08-20", submittedDate: "2026-08-21", hadRevision: true });
    assert.equal(r.outcome, "late");
    assert.equal(r.daysLate, 1);
    assert.equal(r.points, -3);
  });
});

describe("ledger รายคน", () => {
  it("net = −1 (สั่งแก้) + 1 (แก้ทัน) = 0", () => {
    const entries = [
      entry({ assignee: "ICE", outcome: "needs_fix", points: -1, confirmedAt: "2026-08-16T09:00:00.000Z", revisedDue: "2026-08-20" }),
      entry({ assignee: "ICE", outcome: "fixed_pass", points: 1, confirmedAt: "2026-08-20T09:00:00.000Z" })
    ];
    assert.equal(netReviewPoints(entries), 0);
  });

  it("คิดแยกรายคน — ก้อง/พี ได้คนละรายการ", () => {
    const project = baseProject({
      assignees: ["ICE", "Boom"],
      reviews: [
        entry({ assignee: "ICE", outcome: "early_pass", points: 1 }),
        entry({ assignee: "Boom", outcome: "late", points: -6, daysLate: 2, submittedDate: "2026-08-19" })
      ]
    });
    assert.equal(netReviewPoints(reviewEntriesFor(project, "ICE")), 1);
    assert.equal(netReviewPoints(reviewEntriesFor(project, "Boom")), -6);
  });

  it("hasOpenRevision จริงเมื่อรายการล่าสุดเป็น needs_fix", () => {
    const project = baseProject({ reviews: [entry({ assignee: "ICE", outcome: "needs_fix", points: -1, revisedDue: "2026-08-20" })] });
    assert.equal(hasOpenRevision(reviewEntriesFor(project, "ICE")), true);
    assert.equal(effectiveDue(project, "ICE"), "2026-08-20");
  });
});

describe("assigneeStatus — สถานะบนจอ", () => {
  it("ยังไม่ตรวจ = pending", () => {
    assert.equal(assigneeStatus(baseProject(), "ICE"), "pending");
  });

  it("สั่งแก้แต่ยังไม่ส่งใหม่ = needs_fix", () => {
    const project = baseProject({
      reviews: [entry({ assignee: "ICE", outcome: "needs_fix", points: -1, confirmedAt: "2026-08-16T09:00:00.000Z", revisedDue: "2026-08-20" })]
    });
    assert.equal(assigneeStatus(project, "ICE"), "needs_fix");
  });

  it("ส่งใหม่หลังสั่งแก้ (งานกลุ่ม) = awaiting_fix", () => {
    const project = baseProject({
      reviews: [entry({ assignee: "ICE", outcome: "needs_fix", points: -1, confirmedAt: "2026-08-16T09:00:00.000Z", revisedDue: "2026-08-20" })],
      progress: [{ id: "p1", date: "2026-08-18", at: "2026-08-18T10:00:00.000Z", by: "Boom", percent: 90, note: "แก้แล้ว" }]
    });
    assert.equal(assigneeStatus(project, "ICE"), "awaiting_fix");
  });

  it("ผ่านก่อนกำหนด = passed_early, ช้า = late", () => {
    assert.equal(assigneeStatus(baseProject({ reviews: [entry({ assignee: "ICE", outcome: "early_pass", points: 1 })] }), "ICE"), "passed_early");
    assert.equal(assigneeStatus(baseProject({ reviews: [entry({ assignee: "ICE", outcome: "late", points: -3, daysLate: 1 })] }), "ICE"), "late");
  });
});

describe("projectReviewsToAdjustments → KPI", () => {
  it("แปลงเป็น score adjustment หมวด assigned_work, ข้ามรายการ 0 คะแนน", () => {
    const project = baseProject({
      reviews: [
        entry({ assignee: "ICE", outcome: "early_pass", points: 1 }),
        entry({ assignee: "Boom", outcome: "ontime_pass", points: 0 }),
        entry({ assignee: "Boom", outcome: "late", points: -6, daysLate: 2 })
      ]
    });
    const adjustments = projectReviewsToAdjustments([project]);
    assert.equal(adjustments.length, 2); // 0-point ถูกข้าม
    assert.ok(adjustments.every((a) => a.category === "assigned_work"));
    assert.equal(adjustments.find((a) => a.employeeName === "ICE")?.points, 1);
    assert.equal(adjustments.find((a) => a.employeeName === "Boom")?.points, -6);
    assert.ok(adjustments.every((a) => a.workDate === "2026-08-17"));
  });
});
