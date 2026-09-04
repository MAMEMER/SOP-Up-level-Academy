import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ASSIGNED_WORK_AUTO_KPI_START,
  projectNoProgressAdjustments
} from "../lib/assigned-work-auto-kpi.ts";
import type { ProjectProgress, ProjectReviewEntry, WorkProject } from "../lib/work-projects.ts";

function baseProject(over: Partial<WorkProject> = {}): WorkProject {
  return {
    id: "wp-1",
    branch: "bangkae",
    title: "นับ Stock ประจำสัปดาห์",
    startDate: "2026-09-01",
    endDate: "2026-09-08",
    assignees: ["ICE", "Boom"],
    status: "active",
    mode: "group",
    createdBy: "owner@x.com",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    progress: [],
    reviews: [],
    ...over
  };
}

function progress(date: string, by: string, over: Partial<ProjectProgress> = {}): ProjectProgress {
  return { id: `p-${by}-${date}`, date, at: `${date}T10:00:00.000Z`, by, percent: 50, note: "อัปเดต", ...over };
}

function review(over: Partial<ProjectReviewEntry> & Pick<ProjectReviewEntry, "assignee" | "outcome">): ProjectReviewEntry {
  return {
    id: `rv-${over.assignee}-${over.outcome}`,
    dueDate: "2026-09-08",
    daysLate: 0,
    points: 0,
    confirmedBy: "owner@x.com",
    confirmedAt: "2026-09-08T09:00:00.000Z",
    ...over
  };
}

const OPTS = { today: "2026-09-10", startFrom: "2026-09-01" };

describe("projectNoProgressAdjustments — Auto KPI ข้อ 3 (ไม่อัปเดตความคืบหน้า)", () => {
  it("งานกลุ่มไม่มี progress เลย → หักทุกวันในหน้าต่าง ต่อคน", () => {
    const out = projectNoProgressAdjustments([baseProject()], OPTS);
    // 8 วัน (09-01..09-08) × 2 คน
    assert.equal(out.length, 16);
    assert.ok(out.every((a) => a.category === "assigned_work"));
    assert.ok(out.every((a) => a.points === -1));
    assert.ok(out.every((a) => a.recordedBy === "auto"));
    assert.equal(out.filter((a) => a.employeeName === "ICE").length, 8);
    // วันนี้ (09-10) และเมื่อวาน (09-09) อยู่นอกกำหนดส่ง → ไม่โดนหัก
    assert.ok(out.every((a) => a.workDate <= "2026-09-08"));
  });

  it("งานกลุ่ม: ใครในทีมอัปเดตวันนั้น → ทุกคนไม่โดนหักวันนั้น", () => {
    const out = projectNoProgressAdjustments([baseProject({ progress: [progress("2026-09-03", "Boom")] })], OPTS);
    // 7 วันที่เงียบ × 2 คน = 14
    assert.equal(out.length, 14);
    assert.ok(out.every((a) => a.workDate !== "2026-09-03"));
  });

  it("งานเดี่ยว: เจ้าของต้องอัปเดตเอง — หักเฉพาะวันที่ตัวเองเงียบ", () => {
    const project = baseProject({
      assignees: ["ICE"],
      mode: "single",
      progress: [progress("2026-09-02", "ICE"), progress("2026-09-05", "ICE")]
    });
    const out = projectNoProgressAdjustments([project], OPTS);
    // 8 วัน − 2 วันที่อัปเดต = 6
    assert.equal(out.length, 6);
    assert.deepEqual(
      out.map((a) => a.workDate),
      ["2026-09-01", "2026-09-03", "2026-09-04", "2026-09-06", "2026-09-07", "2026-09-08"]
    );
  });

  it("งานวันเดียว → ไม่คิด (ส่งครั้งเดียวจบ)", () => {
    const oneDay = baseProject({ startDate: "2026-09-03", endDate: "2026-09-03" });
    assert.equal(projectNoProgressAdjustments([oneDay], OPTS).length, 0);
  });

  it("ผ่านแล้ว → ตัดหน้าต่างที่วันผ่าน ไม่หักหลังจากนั้น", () => {
    const project = baseProject({
      assignees: ["ICE"],
      mode: "single",
      reviews: [review({ assignee: "ICE", outcome: "early_pass", submittedDate: "2026-09-04" })]
    });
    const out = projectNoProgressAdjustments([project], OPTS);
    assert.ok(out.every((a) => a.workDate <= "2026-09-04"));
  });

  it("ถูกสั่งแก้ (revisedDue) → ขยายหน้าต่างถึงกำหนดใหม่", () => {
    const project = baseProject({
      assignees: ["ICE"],
      mode: "single",
      reviews: [review({ assignee: "ICE", outcome: "needs_fix", points: -1, revisedDue: "2026-09-09" })]
    });
    const out = projectNoProgressAdjustments([project], OPTS);
    // effectiveDue = 09-09 แต่ตัดที่เมื่อวาน (09-09) → 09-01..09-09 = 9 วัน
    assert.equal(out.length, 9);
    assert.equal(out[out.length - 1].workDate, "2026-09-09");
  });

  it("งานยกเลิก → ข้ามทั้งงาน", () => {
    assert.equal(projectNoProgressAdjustments([baseProject({ status: "cancelled" })], OPTS).length, 0);
  });

  it("งานปิดแล้ว → ตัดที่วันอัปเดตล่าสุด (ทำจบแล้วไม่ต้องอัปเดตต่อ)", () => {
    const project = baseProject({
      status: "done",
      assignees: ["ICE"],
      mode: "single",
      progress: [progress("2026-09-02", "ICE"), progress("2026-09-03", "ICE")]
    });
    const out = projectNoProgressAdjustments([project], OPTS);
    // นับถึง 09-03 (last progress): เงียบเฉพาะ 09-01 → 1 วัน
    assert.deepEqual(out.map((a) => a.workDate), ["2026-09-01"]);
  });

  it("rate 0 → ปิดการหัก", () => {
    assert.equal(projectNoProgressAdjustments([baseProject()], { ...OPTS, ratePerDay: 0 }).length, 0);
  });

  it("ปรับ rate ได้ (จาก /admin/kpi-rules)", () => {
    const out = projectNoProgressAdjustments([baseProject({ assignees: ["ICE"], mode: "single" })], { ...OPTS, ratePerDay: 2 });
    assert.ok(out.every((a) => a.points === -2));
  });

  it("ไม่หักย้อนหลังก่อนวันเปิดใช้ (go-live gate)", () => {
    // งานทั้งก้อนอยู่ก่อน ASSIGNED_WORK_AUTO_KPI_START → ไม่มีรายการหักเลย
    const oldProject = baseProject({ startDate: "2026-08-01", endDate: "2026-08-10" });
    const out = projectNoProgressAdjustments([oldProject], { today: "2026-08-25" });
    assert.equal(out.length, 0);
    assert.equal(ASSIGNED_WORK_AUTO_KPI_START, "2026-09-01");
  });

  it("วันนี้ยังไม่จบ → นับถึงเมื่อวานเท่านั้น", () => {
    // งานยังไม่ถึงกำหนด แต่ผ่านไปหลายวันแล้ว: today 09-05, end 09-30
    const project = baseProject({ endDate: "2026-09-30", assignees: ["ICE"], mode: "single" });
    const out = projectNoProgressAdjustments([project], { today: "2026-09-05", startFrom: "2026-09-01" });
    // นับ 09-01..09-04 (เมื่อวาน) = 4 วัน — ไม่รวม 09-05 (วันนี้)
    assert.equal(out.length, 4);
    assert.equal(out[out.length - 1].workDate, "2026-09-04");
  });
});

describe("ใบงาน YOW — หักเฉพาะวันที่เข้าทำงานจริงตามกะ (workedDays)", () => {
  it("ส่ง workedDays → หักเฉพาะวันที่คนนั้นเข้ากะจริง ไม่หักวันหยุด", () => {
    // งานเดี่ยว ICE 09-01..09-08 เงียบทุกวัน แต่เข้ากะจริงแค่ 09-02, 09-04, 09-07
    const project = baseProject({ assignees: ["ICE"], mode: "single" });
    const workedDays = new Set(["ICE:2026-09-02", "ICE:2026-09-04", "ICE:2026-09-07"]);
    const out = projectNoProgressAdjustments([project], { ...OPTS, workedDays });
    assert.deepEqual(out.map((a) => a.workDate), ["2026-09-02", "2026-09-04", "2026-09-07"]);
  });

  it("เข้ากะจริงแต่ 'อัปเดตงาน' วันนั้น → ไม่โดนหัก", () => {
    // เข้ากะ 09-02 และ 09-04 แต่ลง progress วันที่ 09-02 → เหลือหักแค่ 09-04
    const project = baseProject({
      assignees: ["ICE"],
      mode: "single",
      progress: [progress("2026-09-02", "ICE")]
    });
    const workedDays = new Set(["ICE:2026-09-02", "ICE:2026-09-04"]);
    const out = projectNoProgressAdjustments([project], { ...OPTS, workedDays });
    assert.deepEqual(out.map((a) => a.workDate), ["2026-09-04"]);
  });

  it("workedDays แยกรายคน — งานกลุ่มก็หักเฉพาะวันที่คนนั้นเข้ากะ", () => {
    const project = baseProject(); // group ICE + Boom
    const workedDays = new Set(["ICE:2026-09-03", "Boom:2026-09-05"]);
    const out = projectNoProgressAdjustments([project], { ...OPTS, workedDays });
    assert.deepEqual(
      out.map((a) => [a.workDate, a.employeeName]).sort(),
      [
        ["2026-09-03", "ICE"],
        ["2026-09-05", "Boom"]
      ].sort()
    );
  });

  it("workedDays ว่าง → ไม่หักเลย (ดึง attendance ไม่ได้ = ปลอดภัยกว่าหักเกิน)", () => {
    const out = projectNoProgressAdjustments([baseProject()], { ...OPTS, workedDays: new Set() });
    assert.equal(out.length, 0);
  });

  it("ไม่ส่ง workedDays → พฤติกรรมเดิม (ไม่กรองด้วยการเข้างาน)", () => {
    const out = projectNoProgressAdjustments([baseProject()], OPTS);
    assert.equal(out.length, 16); // เท่ากับเทสต์แรกสุด
  });
});

describe("งานที่ส่งต่อแล้ว — หักเฉพาะคนที่ถือครองในวันนั้น", () => {
  it("งานเดี่ยวที่ส่งต่อกลางทาง ไม่หักสองหัวในวันเดียวกัน", () => {
    const project: WorkProject = {
      id: "wp-ho",
      branch: "bangkae",
      title: "จัดชั้นการ์ด",
      startDate: "2026-09-01",
      endDate: "2026-09-05",
      assignees: ["ICE", "Boom"],
      status: "active",
      mode: "single",
      createdBy: "owner@x.com",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      originalOwner: "ICE",
      currentOwner: "Boom",
      progress: [],
      handovers: [
        { id: "ho-1", from: "ICE", to: "Boom", date: "2026-09-03", at: "2026-09-03T10:00:00.000Z", status: "accepted", by: "ice@x.com" }
      ]
    };
    const rows = projectNoProgressAdjustments([project], { today: "2026-09-05", startFrom: "2026-09-01" });
    // 1–4 ก.ย. (ถึงเมื่อวาน) — 1,2 เป็นของ ICE · 3,4 เป็นของ Boom · ห้ามซ้อนกัน
    assert.deepEqual(
      rows.map((row) => [row.workDate, row.employeeName]),
      [
        ["2026-09-01", "ICE"],
        ["2026-09-02", "ICE"],
        ["2026-09-03", "Boom"],
        ["2026-09-04", "Boom"]
      ]
    );
  });
});
