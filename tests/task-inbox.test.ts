import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  amountDone,
  countdownText,
  everyoneDone,
  fileSections,
  inboxTasks,
  isLateFor,
  monthFolders,
  progressText,
  rowTone,
  taskState,
  taskTone,
  trackModeOf,
  validateSubmission,
  validateTrack,
  workingDates,
  workdaysLeft
} from "../lib/task-inbox.ts";
import type { ProjectReviewEntry, WorkProject } from "../lib/work-projects.ts";

function task(over: Partial<WorkProject> = {}): WorkProject {
  return {
    id: "t1",
    branch: "bangkae",
    title: "ติดลูกโป่ง",
    startDate: "2026-10-04",
    endDate: "2026-10-04",
    assignees: ["Boom"],
    status: "active",
    createdBy: "owner",
    createdAt: "2026-10-04T01:00:00.000Z",
    updatedAt: "2026-10-04T01:00:00.000Z",
    progress: [],
    ...over
  };
}

function review(over: Partial<ProjectReviewEntry>): ProjectReviewEntry {
  return {
    id: "rv",
    assignee: "Boom",
    outcome: "ontime_pass",
    dueDate: "2026-10-04",
    daysLate: 0,
    points: 0,
    confirmedBy: "owner",
    confirmedAt: "2026-10-05T03:00:00.000Z",
    ...over
  };
}

const sub = (at: string, by = "Boom") => ({ id: at, by, at, date: at.slice(0, 10), note: "เสร็จ", images: ["https://x/y.jpg"] });

describe("trackModeOf", () => {
  it("งานเก่าวันเดียว = เสร็จ/ไม่เสร็จ, หลายวัน = %", () => {
    assert.equal(trackModeOf(task()), "done");
    assert.equal(trackModeOf(task({ endDate: "2026-10-08" })), "percent");
    assert.equal(trackModeOf(task({ endDate: "2026-10-08", trackMode: "workdays" })), "workdays");
  });
});

describe("workingDates — นับเฉพาะวันที่เข้ากะ", () => {
  it("ข้ามวันที่ไม่มีกะ ในช่วงที่วางกะไว้แล้ว", () => {
    const worked = new Set(["2026-10-04", "2026-10-06", "2026-10-07", "2026-10-09"]);
    assert.deepEqual(workingDates("2026-10-04", 3, worked, "2026-10-31"), ["2026-10-04", "2026-10-06", "2026-10-07"]);
  });
  it("เลยวันที่วางกะ → นับทุกวันไปก่อน", () => {
    const worked = new Set(["2026-10-04"]);
    assert.deepEqual(workingDates("2026-10-04", 3, worked, "2026-10-05"), ["2026-10-04", "2026-10-06", "2026-10-07"]);
  });
  it("ไม่มีตารางกะเลย = ทุกวันเป็นวันทำงาน", () => {
    assert.deepEqual(workingDates("2026-10-04", 2, new Set(), null), ["2026-10-04", "2026-10-05"]);
  });
  it("วันทำงานที่เหลือ", () => {
    const t = task({ workDayDates: ["2026-10-04", "2026-10-06", "2026-10-07"] });
    assert.equal(workdaysLeft(t, "2026-10-05"), 2);
  });
});

describe("taskState — ไม่หายจากหน้าแจ้งเตือนจนกว่าจะส่งสมบูรณ์", () => {
  it("ยังไม่ส่ง = กำลังทำ · ส่งแล้ว = รอตรวจ", () => {
    assert.equal(taskState(task(), "Boom"), "active");
    assert.equal(taskState(task({ submissions: [sub("2026-10-04T10:00:00.000Z")] }), "Boom"), "submitted");
  });
  it("สั่งแก้ → กลับมาเป็นต้องแก้ไข จนกว่าจะส่งใหม่", () => {
    const fix = review({ outcome: "needs_fix", points: -1, revisedDue: "2026-10-06" });
    const t = task({ submissions: [sub("2026-10-04T10:00:00.000Z")], reviews: [fix] });
    assert.equal(taskState(t, "Boom"), "needs_fix");
    assert.equal(taskTone(t, "Boom", "2026-10-05"), "red");
    const resent = { ...t, submissions: [...t.submissions!, sub("2026-10-06T10:00:00.000Z")] };
    assert.equal(taskState(resent, "Boom"), "submitted");
  });
  it("ผ่าน = เขียว · ผ่านแต่โดนหัก = แดง", () => {
    assert.equal(taskTone(task({ reviews: [review({})] }), "Boom", "2026-10-06"), "green");
    assert.equal(taskTone(task({ reviews: [review({ outcome: "late", points: -3 })] }), "Boom", "2026-10-06"), "red");
  });
  it("งานเดี่ยว: คนอื่นส่งแทนไม่นับ · งานกลุ่มนับ", () => {
    const solo = task({ assignees: ["Boom", "Leo"], mode: "single", submissions: [sub("2026-10-04T10:00:00.000Z", "Leo")] });
    assert.equal(taskState(solo, "Boom"), "active");
    assert.equal(taskState({ ...solo, mode: "group" }, "Boom"), "submitted");
  });
  it("งานเดี่ยว 2 คน: คนแรกส่ง/งานปิด อีกคนยังต้องส่ง", () => {
    const t = task({ assignees: ["Boom", "Leo"], mode: "single", status: "done", submissions: [sub("2026-10-04T10:00:00.000Z")] });
    assert.equal(taskState(t, "Leo"), "active");
    assert.equal(everyoneDone(t), false);
    assert.equal(everyoneDone({ ...t, submissions: [...t.submissions!, sub("2026-10-04T11:00:00.000Z", "Leo")] }), true);
  });
  it("เลยกำหนดและยังไม่ส่ง = แดง", () => {
    assert.equal(isLateFor(task(), "Boom", "2026-10-05"), true);
    assert.equal(rowTone(task(), ["Boom"], "2026-10-05"), "red");
  });
});

describe("inboxTasks / แฟ้มงาน", () => {
  const a = task({ id: "a", endDate: "2026-10-09" });
  const b = task({ id: "b", submissions: [sub("2026-10-04T10:00:00.000Z")] });
  const c = task({ id: "c", reviews: [review({ outcome: "needs_fix", revisedDue: "2026-10-10" })] });
  const d = task({ id: "d", startDate: "2026-09-10", endDate: "2026-09-10", reviews: [review({})] });

  it("แจ้งเตือนงาน = กำลังทำ + ต้องแก้ (ต้องแก้ขึ้นก่อน)", () => {
    assert.deepEqual(inboxTasks([a, b, c, d], "Boom").map((t) => t.id), ["c", "a"]);
  });
  it("แฟ้มแยกเดือน ใหม่สุดก่อน + นับเขียว/แดง", () => {
    const folders = monthFolders([a, b, c, d], "Boom", "2026-10-04");
    assert.deepEqual(folders.map((f) => f.month), ["2026-10", "2026-09"]);
    assert.equal(folders[1].green, 1);
    assert.equal(folders[0].red, 1);
    assert.equal(folders[0].waiting, 1);
  });
  it("แบ่งกองในแฟ้ม", () => {
    const s = fileSections([a, b, c, d], "Boom");
    assert.deepEqual([s.active.length, s.needsFix.length, s.waiting.length, s.passed.length], [1, 1, 1, 1]);
  });
});

describe("ข้อความที่น้องอ่าน", () => {
  it("นับถอยหลัง", () => {
    assert.equal(countdownText(task({ endDate: "2026-10-07" }), "Boom", "2026-10-04"), "เหลืออีก 3 วัน");
    assert.equal(countdownText(task(), "Boom", "2026-10-04"), "ต้องส่งวันนี้");
    assert.equal(countdownText(task(), "Boom", "2026-10-06"), "เลยกำหนดมา 2 วัน");
  });
  it("นับเนื้องาน = รวมที่ส่งมาทุกครั้ง", () => {
    const t = task({
      trackMode: "amount",
      targetAmount: 3000,
      unit: "ใบ",
      progress: [
        { id: "1", date: "2026-10-04", at: "x", by: "Boom", percent: 0, note: "", amount: 500 },
        { id: "2", date: "2026-10-05", at: "y", by: "Boom", percent: 0, note: "", amount: 700 }
      ]
    });
    assert.equal(amountDone(t), 1200);
    assert.match(progressText(t, "2026-10-05"), /1,200 \/ 3,000 ใบ/);
  });
});

describe("validate", () => {
  it("ส่งงานต้องมีรูป", () => {
    assert.ok(validateSubmission({ note: "เสร็จ", images: [] }));
    assert.equal(validateSubmission({ note: "เสร็จ", images: ["u"] }), null);
  });
  it("ค่าการนับ", () => {
    assert.ok(validateTrack({ trackMode: "workdays", workDays: 0 }));
    assert.ok(validateTrack({ trackMode: "amount", targetAmount: 0 }));
    assert.equal(validateTrack({ trackMode: "workdays", workDays: 5 }), null);
  });
});
