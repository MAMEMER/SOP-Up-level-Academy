import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adminFollowUps,
  assignmentToFocusTask,
  buildFocusBoard,
  countdownLabel,
  deadlineLabel,
  deadlineMs,
  projectToFocusTask,
  sortFocusTasks,
  type FocusTask
} from "../lib/task-focus.ts";
import type { WorkAssignment } from "../lib/work-assignments-store.ts";
import type { WorkProject } from "../lib/work-projects.ts";

const TODAY = "2026-08-25";
/** 25 ส.ค. 2026 เวลา 15:00 ไทย */
const NOW = Date.parse("2026-08-25T08:00:00.000Z");

function assignment(over: Partial<WorkAssignment> = {}): WorkAssignment {
  return {
    id: "wa-1",
    branch: "bangkae",
    workDate: TODAY,
    staffCode: "ICE",
    title: "ส่งพัสดุ 3 กล่อง",
    status: "open",
    assignedBy: "owner@x.com",
    createdAt: "2026-08-25T01:00:00.000Z",
    ...over
  };
}

function project(over: Partial<WorkProject> = {}): WorkProject {
  return {
    id: "wp-1",
    branch: "bangkae",
    title: "จัดชั้นการ์ดใหม่",
    startDate: "2026-08-20",
    endDate: "2026-08-28",
    assignees: ["ICE"],
    status: "active",
    mode: "single",
    createdBy: "owner@x.com",
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    currentOwner: "ICE",
    originalOwner: "ICE",
    progress: [],
    ...over
  };
}

describe("กำหนดส่ง + นับถอยหลัง", () => {
  it("ไม่ระบุเวลา = สิ้นวันเวลาไทย", () => {
    assert.equal(deadlineMs("2026-08-25"), Date.parse("2026-08-25T16:59:59.000Z"));
    assert.equal(deadlineMs("2026-08-25", "15:30"), Date.parse("2026-08-25T08:30:59.000Z"));
  });

  it("นับถอยหลังอ่านรู้เรื่องทั้งก่อนและหลังกำหนด", () => {
    assert.equal(countdownLabel(NOW + 18 * 60000, NOW), "เหลือ 18 นาที");
    assert.equal(countdownLabel(NOW - 25 * 60000, NOW), "เกินกำหนด 25 นาที");
    assert.equal(countdownLabel(NOW + 3 * 3600000, NOW), "เหลือ 3 ชั่วโมง");
    assert.equal(countdownLabel(NOW - 3 * 86400000, NOW), "เกินกำหนด 3 วัน");
  });

  it("บอกกำหนดของวันนี้เป็นเวลา ไม่ใช่วันที่", () => {
    assert.equal(deadlineLabel({ dueDate: TODAY, dueTime: "15:30" }, TODAY), "ต้องเสร็จภายใน 15:30");
    assert.equal(deadlineLabel({ dueDate: TODAY }, TODAY), "ต้องเสร็จภายในวันนี้");
    assert.equal(deadlineLabel({ dueDate: "2026-08-28" }, TODAY), "ภายใน 2026-08-28");
  });
});

describe("งานที่มอบหมายรายวัน → การ์ด", () => {
  it("เลยเวลาแล้ว = เกินกำหนด และ CTA คือเริ่มงาน", () => {
    const task = assignmentToFocusTask(assignment({ dueTime: "14:00" }), NOW, TODAY);
    assert.equal(task.urgency, "overdue");
    assert.equal(task.ctaLabel, "เริ่มงาน");
  });

  it("เหลือไม่เกิน 30 นาที = ใกล้ครบกำหนด", () => {
    const task = assignmentToFocusTask(assignment({ dueTime: "15:20" }), NOW, TODAY);
    assert.equal(task.urgency, "due_soon");
  });

  it("เริ่มทำแล้ว CTA เปลี่ยนเป็นทำต่อ", () => {
    const task = assignmentToFocusTask(
      assignment({ dueTime: "18:00", progress: [{ id: "ap-1", at: "2026-08-25T07:00:00.000Z", by: "ICE", note: "แพ็คแล้ว 1 กล่อง" }] }),
      NOW,
      TODAY
    );
    assert.equal(task.ctaLabel, "ทำต่อ");
    assert.equal(task.urgency, "in_progress");
  });

  it("ส่งแล้วรอตรวจ / ต้องแก้ไข / ผ่านแล้ว แยกกันชัด", () => {
    assert.equal(assignmentToFocusTask(assignment({ status: "submitted" }), NOW, TODAY).urgency, "waiting_review");
    const revision = assignmentToFocusTask(assignment({ status: "needs_revision", dueTime: "18:00", revisionNote: "ใส่รูปให้ครบ" }), NOW, TODAY);
    assert.equal(revision.ctaLabel, "แก้ไขงาน");
    assert.equal(revision.note, "ต้องแก้: ใส่รูปให้ครบ");
    assert.equal(assignmentToFocusTask(assignment({ status: "done" }), NOW, TODAY).urgency, "done");
  });
});

describe("งานโปรเจกต์ → การ์ด", () => {
  it("ยังไม่อัปเดตวันนี้ → บอกให้อัปเดต และเจ้าของคืองาน owner ปัจจุบัน", () => {
    const task = projectToFocusTask(
      project({
        assignees: ["ICE", "Boom"],
        currentOwner: "Boom",
        handovers: [{ id: "ho-1", from: "ICE", to: "Boom", date: "2026-08-24", at: "2026-08-24T10:00:00.000Z", status: "accepted", by: "ice@x.com" }]
      }),
      NOW,
      TODAY
    );
    assert.equal(task.ownerCode, "Boom");
    assert.equal(task.ownerLabel, "Boom");
    assert.equal(task.ctaLabel, "อัปเดตความคืบหน้า");
    assert.match(task.note ?? "", /วันนี้ยังไม่ได้อัปเดต/);
    // งานวันเดียวส่งครั้งเดียวจบ — CTA ต่างกัน
    assert.equal(projectToFocusTask(project({ startDate: TODAY, endDate: TODAY }), NOW, TODAY).ctaLabel, "ส่งงาน");
  });

  it("งานหลายวันที่อัปเดตแล้ววันนี้ = กำลังทำ", () => {
    const task = projectToFocusTask(
      project({
        endDate: "2026-08-30",
        progress: [{ id: "pg-1", date: TODAY, at: "2026-08-25T04:00:00.000Z", by: "ICE", percent: 40, note: "ทำต่อ" }]
      }),
      NOW,
      TODAY
    );
    assert.equal(task.urgency, "in_progress");
    assert.equal(task.ctaLabel, "อัปเดตเพิ่ม");
    assert.equal(task.note, "40% · วันนี้อัปเดตแล้ว");
  });

  it("เลยวันสิ้นสุดแล้วยังไม่ปิด = เกินกำหนด", () => {
    assert.equal(projectToFocusTask(project({ endDate: "2026-08-20" }), NOW, TODAY).urgency, "overdue");
  });

  it("ปิดงานแล้วไปอยู่กลุ่มเสร็จแล้ว", () => {
    assert.equal(projectToFocusTask(project({ status: "done" }), NOW, TODAY).urgency, "done");
  });
});

describe("การจัดลำดับบนกระดาน", () => {
  function task(over: Partial<FocusTask> & Pick<FocusTask, "id" | "urgency" | "dueAt">): FocusTask {
    return {
      source: "assignment",
      title: over.id,
      dueDate: TODAY,
      ownerCode: "ICE",
      ownerLabel: "ICE",
      ctaLabel: "เริ่มงาน",
      href: "/",
      ...over
    };
  }

  it("เกินกำหนดขึ้นก่อน แล้วค่อยใกล้ครบกำหนดที่สุด · เสร็จแล้วท้ายสุด", () => {
    const sorted = sortFocusTasks([
      task({ id: "done", urgency: "done", dueAt: NOW - 99999 }),
      task({ id: "today-late", urgency: "today", dueAt: NOW + 5 * 3600000 }),
      task({ id: "soon", urgency: "due_soon", dueAt: NOW + 10 * 60000 }),
      task({ id: "overdue-2", urgency: "overdue", dueAt: NOW - 60 * 60000 }),
      task({ id: "overdue-1", urgency: "overdue", dueAt: NOW - 120 * 60000 })
    ]);
    assert.deepEqual(sorted.map((item) => item.id), ["overdue-1", "overdue-2", "soon", "today-late", "done"]);
  });

  it("แยกกลุ่มและนับหัวแถบให้ตรง — งานเสร็จแล้วไม่แย่งที่งานค้าง", () => {
    const board = buildFocusBoard([
      task({ id: "a", urgency: "overdue", dueAt: NOW - 1000 }),
      task({ id: "b", urgency: "due_soon", dueAt: NOW + 1000 }),
      task({ id: "c", urgency: "today", dueAt: NOW + 100000 }),
      task({ id: "d", urgency: "in_progress", dueAt: NOW + 200000 }),
      task({ id: "e", urgency: "waiting_review", dueAt: NOW + 300000 }),
      task({ id: "f", urgency: "done", dueAt: NOW - 5000 })
    ]);
    assert.deepEqual(board.now.map((item) => item.id), ["a", "b", "c", "d"]);
    assert.deepEqual(board.waiting.map((item) => item.id), ["e"]);
    assert.deepEqual(board.done.map((item) => item.id), ["f"]);
    assert.deepEqual(board.counts, { overdue: 1, dueSoon: 1, today: 1, inProgress: 1, done: 1 });
  });

  it("แอดมินได้ลิสต์ที่ต้องตาม: เกินกำหนด + ใกล้ครบ + รอตรวจ", () => {
    const board = buildFocusBoard([
      task({ id: "a", urgency: "overdue", dueAt: NOW - 1000 }),
      task({ id: "b", urgency: "today", dueAt: NOW + 100000 }),
      task({ id: "c", urgency: "waiting_review", dueAt: NOW + 300000 })
    ]);
    assert.deepEqual(adminFollowUps(board).map((item) => item.id), ["a", "c"]);
  });
});
