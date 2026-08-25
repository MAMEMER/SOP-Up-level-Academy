import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyHandover,
  currentOwnerOf,
  datesBetween,
  handoverHistory,
  idleDayAdjustments,
  isInvolved,
  lateDaysByOwner,
  originalOwnerOf,
  ownerChain,
  ownerOnDate,
  validateHandover,
  type ProjectHandover
} from "../lib/project-handover.ts";
import { splitReviewByOwner } from "../lib/project-review.ts";
import type { ProjectProgress, WorkProject } from "../lib/work-projects.ts";

function baseProject(over: Partial<WorkProject> = {}): WorkProject {
  return {
    id: "wp-1",
    branch: "bangkae",
    title: "จัดของขึ้นชั้น",
    startDate: "2026-08-10",
    endDate: "2026-08-14",
    assignees: ["ICE"],
    status: "active",
    mode: "single",
    createdBy: "owner@x.com",
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    originalOwner: "ICE",
    currentOwner: "ICE",
    progress: [],
    ...over
  };
}

function handover(over: Partial<ProjectHandover> & Pick<ProjectHandover, "from" | "to" | "date">): ProjectHandover {
  return {
    id: `ho-${over.from}-${over.to}-${over.date}`,
    at: `${over.date}T10:00:00.000Z`,
    status: "accepted",
    by: "ice@x.com",
    ...over
  };
}

function progress(date: string, by = "ICE"): ProjectProgress {
  return { id: `pg-${date}-${by}`, date, at: `${date}T09:00:00.000Z`, by, percent: 20, note: "ทำต่อ" };
}

describe("ผู้รับผิดชอบปัจจุบัน / ประวัติ", () => {
  it("งานเก่าที่ยังไม่มีฟิลด์ owner ใช้ชื่อแรกในรายชื่อ", () => {
    const project = baseProject({ assignees: ["Boom", "ICE"], currentOwner: undefined, originalOwner: undefined });
    assert.equal(originalOwnerOf(project), "Boom");
    assert.equal(currentOwnerOf(project), "Boom");
  });

  it("ส่งต่อแล้ว owner เปลี่ยน แต่คนเดิมยังอยู่ในสายผู้รับผิดชอบ", () => {
    const project = baseProject({
      assignees: ["ICE", "Boom"],
      currentOwner: "Boom",
      handovers: [handover({ from: "ICE", to: "Boom", date: "2026-08-12" })]
    });
    assert.equal(currentOwnerOf(project), "Boom");
    assert.deepEqual(ownerChain(project), ["ICE", "Boom"]);
    assert.ok(isInvolved(project, "ICE"));
  });

  it("owner ของแต่ละวัน — ส่งต่อวันไหน วันนั้นเป็นของคนรับเลย", () => {
    const project = baseProject({
      assignees: ["ICE", "Boom"],
      currentOwner: "Boom",
      handovers: [handover({ from: "ICE", to: "Boom", date: "2026-08-12" })]
    });
    assert.equal(ownerOnDate(project, "2026-08-11"), "ICE");
    assert.equal(ownerOnDate(project, "2026-08-12"), "Boom");
    assert.equal(ownerOnDate(project, "2026-08-20"), "Boom");
  });

  it("ส่งต่อหลายทอด เรียงตามวันที่มีผล", () => {
    const project = baseProject({
      assignees: ["ICE", "Boom", "Nam"],
      currentOwner: "Nam",
      handovers: [
        handover({ from: "Boom", to: "Nam", date: "2026-08-13" }),
        handover({ from: "ICE", to: "Boom", date: "2026-08-11" })
      ]
    });
    assert.deepEqual(handoverHistory(project).map((entry) => entry.to), ["Boom", "Nam"]);
    assert.equal(ownerOnDate(project, "2026-08-12"), "Boom");
    assert.equal(ownerOnDate(project, "2026-08-13"), "Nam");
  });
});

describe("กติกาการส่งต่อ", () => {
  const project = baseProject({ assignees: ["ICE"], currentOwner: "ICE" });

  it("คนที่ไม่ได้ถืองานอยู่ ส่งต่อไม่ได้", () => {
    const error = validateHandover(project, { to: "Boom", date: "2026-08-12" }, { staffCode: "Boom", isAdmin: false });
    assert.equal(error, "ส่งต่อได้เฉพาะงานที่คุณเป็นผู้รับผิดชอบตอนนี้");
  });

  it("งานที่ปิดแล้วส่งต่อไม่ได้", () => {
    const done = baseProject({ status: "done" });
    assert.equal(validateHandover(done, { to: "Boom", date: "2026-08-12" }, { staffCode: "ICE", isAdmin: false }), "งานนี้ปิดแล้ว ส่งต่อไม่ได้");
  });

  it("ส่งให้คนเดิมไม่ได้", () => {
    assert.equal(validateHandover(project, { to: "ICE", date: "2026-08-12" }, { staffCode: "ICE", isAdmin: false }), "คนรับงานเป็นคนเดิมอยู่แล้ว");
  });

  it("แอดมินบังคับเปลี่ยนคนต้องมีเหตุผล", () => {
    assert.equal(
      validateHandover(project, { to: "Boom", date: "2026-08-12", forced: true }, { staffCode: "owner", isAdmin: true }),
      "แอดมินเปลี่ยนผู้รับผิดชอบต้องระบุเหตุผล"
    );
    assert.equal(
      validateHandover(project, { to: "Boom", date: "2026-08-12", forced: true, note: "ICE ลาป่วย" }, { staffCode: "owner", isAdmin: true }),
      null
    );
  });

  it("ส่งต่อแล้วผู้รับถูกเพิ่มเข้าทีม และคนเดิมไม่ถูกถอดออก", () => {
    const patch = applyHandover(project, { to: "Boom", date: "2026-08-12", note: "เหลือชั้น 3" }, { at: "2026-08-12T10:00:00.000Z", by: "ice@x.com" });
    assert.equal(patch.currentOwner, "Boom");
    assert.equal(patch.originalOwner, "ICE");
    assert.deepEqual(patch.assignees, ["ICE", "Boom"]);
    assert.equal(patch.entry.status, "accepted");
    assert.equal(patch.entry.from, "ICE");
    assert.equal(patch.entry.note, "เหลือชั้น 3");
  });
});

describe("KPI ตามช่วงที่ถือครองงาน", () => {
  it("วันล่าช้าถูกแบ่งให้ owner ของแต่ละวัน", () => {
    const project = baseProject({
      assignees: ["ICE", "Boom"],
      currentOwner: "Boom",
      handovers: [handover({ from: "ICE", to: "Boom", date: "2026-08-17" })]
    });
    // กำหนด 14 · ส่งจริง 18 → ช้า 15,16 (ICE) และ 17,18 (Boom)
    const shares = lateDaysByOwner(project, "2026-08-14", "2026-08-18");
    assert.deepEqual(shares, [
      { assignee: "ICE", days: ["2026-08-15", "2026-08-16"] },
      { assignee: "Boom", days: ["2026-08-17", "2026-08-18"] }
    ]);
  });

  it("ผลตรวจ 'ผ่านแต่ช้า' แตกเป็นรายการต่อคนตามวันที่ถือครอง", () => {
    const project = baseProject({
      assignees: ["ICE", "Boom"],
      currentOwner: "Boom",
      handovers: [handover({ from: "ICE", to: "Boom", date: "2026-08-17" })]
    });
    const splits = splitReviewByOwner(project, { assignee: "Boom", dueDate: "2026-08-14", submittedDate: "2026-08-18", hadRevision: false });
    assert.equal(splits.length, 2);
    assert.deepEqual(
      splits.map((split) => [split.assignee, split.daysLate, split.points]),
      [
        ["ICE", 2, -6],
        ["Boom", 2, -6]
      ]
    );
  });

  it("งานที่ไม่เคยส่งต่อ ผลตรวจยังเป็นรายการเดียวเหมือนเดิม", () => {
    const project = baseProject();
    const onTime = splitReviewByOwner(project, { assignee: "ICE", dueDate: "2026-08-14", submittedDate: "2026-08-14", hadRevision: false });
    assert.deepEqual(onTime, [{ assignee: "ICE", outcome: "ontime_pass", points: 0, daysLate: 0 }]);
    const late = splitReviewByOwner(project, { assignee: "ICE", dueDate: "2026-08-14", submittedDate: "2026-08-16", hadRevision: false });
    assert.equal(late.length, 1);
    assert.equal(late[0].assignee, "ICE");
    assert.equal(late[0].points, -6);
  });

  it("วันที่เงียบ (ไม่มีอัปเดต) หัก owner ของวันนั้นวันละ 1 และไม่นับวันนี้", () => {
    const project = baseProject({
      assignees: ["ICE", "Boom"],
      currentOwner: "Boom",
      progress: [progress("2026-08-10")],
      handovers: [handover({ from: "ICE", to: "Boom", date: "2026-08-12" })]
    });
    const adjustments = idleDayAdjustments(project, "2026-08-13", 1, "2026-08-01");
    assert.deepEqual(
      adjustments.map((item) => [item.workDate, item.employeeName, item.points]),
      [
        ["2026-08-11", "ICE", -1],
        ["2026-08-12", "Boom", -1]
      ]
    );
  });

  it("หักวันเงียบซ้ำไม่ได้ — id เดิมเสมอสำหรับ (งาน, วัน, คน)", () => {
    const project = baseProject({ progress: [] });
    const first = idleDayAdjustments(project, "2026-08-12", 1, "2026-08-01");
    const second = idleDayAdjustments(project, "2026-08-12", 1, "2026-08-01");
    assert.deepEqual(first.map((item) => item.id), second.map((item) => item.id));
    assert.equal(new Set(first.map((item) => item.id)).size, first.length);
  });

  it("ปิดกติกาวันเงียบได้ด้วยการตั้งค่าเป็น 0 และงานที่ปิดแล้วไม่โดนหัก", () => {
    const project = baseProject({ progress: [] });
    assert.deepEqual(idleDayAdjustments(project, "2026-08-13", 0, "2026-08-01"), []);
    assert.deepEqual(idleDayAdjustments(baseProject({ status: "done", progress: [] }), "2026-08-13", 1, "2026-08-01"), []);
  });

  it("ไม่หักเลยกำหนดสิ้นสุดงาน (ช่วงนั้นคิดเป็นวันล่าช้าอยู่แล้ว)", () => {
    const project = baseProject({ progress: [] });
    const adjustments = idleDayAdjustments(project, "2026-08-20", 1, "2026-08-01");
    assert.deepEqual(adjustments.map((item) => item.workDate), datesBetween("2026-08-10", "2026-08-14"));
  });

  it("ไม่หักย้อนหลังก่อนวันที่กติกาเริ่มใช้ (คะแนนผูกกับเงินเดือน)", () => {
    const project = baseProject({ progress: [] });
    const adjustments = idleDayAdjustments(project, "2026-08-20", 1, "2026-08-13");
    assert.deepEqual(adjustments.map((item) => item.workDate), ["2026-08-13", "2026-08-14"]);
    assert.deepEqual(idleDayAdjustments(project, "2026-08-20", 1, "2026-09-01"), []);
  });
});
