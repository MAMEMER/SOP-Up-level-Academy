import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDays,
  currentPercent,
  dailyTargetPercent,
  dayIndex,
  daysBetween,
  daysLeft,
  expectedPercent,
  hasProgressOn,
  progressAuthorsOn,
  progressCount,
  teamNeedsProgressToday,
  paceOf,
  projectDays,
  projectsForViewer,
  sortProjects,
  totalDays,
  validateProgressInput,
  validateProjectDraft,
  type ProjectProgress,
  type WorkProject
} from "../lib/work-projects.ts";

function progress(date: string, percent: number, by = "ICE", at = `${date}T10:00:00.000Z`): ProjectProgress {
  return { id: `pg-${date}-${by}-${percent}`, date, at, by, percent, note: "ทำแล้ว" };
}

function project(overrides: Partial<WorkProject> = {}): WorkProject {
  return {
    id: "wp-1",
    branch: "bangkae",
    title: "จัดร้านใหม่",
    startDate: "2026-08-01",
    endDate: "2026-08-10",
    assignees: ["ICE"],
    status: "active",
    createdBy: "champ@example.com",
    createdAt: "2026-08-01T02:00:00.000Z",
    updatedAt: "2026-08-01T02:00:00.000Z",
    progress: [],
    ...overrides
  };
}

describe("work projects — ช่วงเวลาและจำนวนวัน", () => {
  it("นับรวมวันเริ่มและวันสิ้นสุด (1–10 ส.ค. = 10 วัน)", () => {
    assert.equal(totalDays("2026-08-01", "2026-08-10"), 10);
    assert.equal(totalDays("2026-08-01", "2026-08-01"), 1);
  });

  it("วันสิ้นสุดก่อนวันเริ่มยังนับเป็นอย่างน้อย 1 วัน (ไม่ติดลบ)", () => {
    assert.equal(totalDays("2026-08-10", "2026-08-01"), 1);
  });

  it("daysBetween / addDays ไม่เพี้ยนข้ามเดือน", () => {
    assert.equal(daysBetween("2026-07-31", "2026-08-01"), 1);
    assert.equal(addDays("2026-07-31", 1), "2026-08-01");
    assert.equal(addDays("2026-08-01", -1), "2026-07-31");
  });

  it("dayIndex บอกว่าวันนี้เป็นวันที่เท่าไหร่ และไม่หลุดขอบ", () => {
    const p = project();
    assert.equal(dayIndex(p, "2026-07-30"), 0); // ยังไม่ถึงวันเริ่ม
    assert.equal(dayIndex(p, "2026-08-01"), 1);
    assert.equal(dayIndex(p, "2026-08-05"), 5);
    assert.equal(dayIndex(p, "2026-08-20"), 10); // เลยกำหนดแล้ว
  });

  it("daysLeft นับวันนี้ด้วย และเลยกำหนดแล้วเป็น 0", () => {
    const p = project();
    assert.equal(daysLeft(p, "2026-08-10"), 1);
    assert.equal(daysLeft(p, "2026-08-08"), 3);
    assert.equal(daysLeft(p, "2026-08-11"), 0);
  });
});

describe("work projects — เปอร์เซ็นต์และการตามแผน", () => {
  it("% ปัจจุบัน = ของ progress ล่าสุด ไม่ใช่ของครั้งแรก", () => {
    const p = project({ progress: [progress("2026-08-01", 10), progress("2026-08-03", 40)] });
    assert.equal(currentPercent(p), 40);
  });

  it("วันเดียวกันหลายครั้ง เอาครั้งที่กดล่าสุด", () => {
    const p = project({
      progress: [
        progress("2026-08-02", 20, "ICE", "2026-08-02T05:00:00.000Z"),
        progress("2026-08-02", 35, "ICE", "2026-08-02T15:00:00.000Z")
      ]
    });
    assert.equal(currentPercent(p), 35);
  });

  it("ยังไม่มี progress = 0% และงานที่ปิดแล้ว = 100%", () => {
    assert.equal(currentPercent(project()), 0);
    assert.equal(currentPercent(project({ status: "done" })), 100);
  });

  it("เป้าหมายตามแผน = วันที่ผ่านไป ÷ วันทั้งหมด", () => {
    const p = project();
    assert.equal(expectedPercent(p, "2026-08-05"), 50);
    assert.equal(expectedPercent(p, "2026-08-10"), 100);
    assert.equal(expectedPercent(p, "2026-07-25"), 0);
  });

  it("pace บอกช้า/ตามแผน/เร็ว จาก % เทียบเป้าหมายวันนั้น", () => {
    assert.equal(paceOf(project({ progress: [progress("2026-08-05", 20)] }), "2026-08-05"), "behind");
    assert.equal(paceOf(project({ progress: [progress("2026-08-05", 50)] }), "2026-08-05"), "on_track");
    assert.equal(paceOf(project({ progress: [progress("2026-08-05", 80)] }), "2026-08-05"), "ahead");
  });

  it("ยังไม่ถึงวันเริ่ม / เลยกำหนดแล้ว / เสร็จแล้ว มีสถานะของตัวเอง", () => {
    assert.equal(paceOf(project(), "2026-07-20"), "not_started");
    assert.equal(paceOf(project({ progress: [progress("2026-08-09", 60)] }), "2026-08-15"), "overdue");
    assert.equal(paceOf(project({ progress: [progress("2026-08-04", 100)] }), "2026-08-05"), "done");
  });

  it("ต้องทำวันละกี่ % ถึงจะทัน — ปัดขึ้นเสมอ ไม่ให้ตั้งเป้าต่ำกว่าจริง", () => {
    // เหลือ 60% ใน 4 วัน (7–10 ส.ค.) → 15%/วัน
    assert.equal(dailyTargetPercent(project({ progress: [progress("2026-08-06", 40)] }), "2026-08-07"), 15);
    // เหลือ 50% ใน 3 วัน → 16.67 → 17
    assert.equal(dailyTargetPercent(project({ progress: [progress("2026-08-07", 50)] }), "2026-08-08"), 17);
    // เลยกำหนดแล้ว = ต้องเก็บที่เหลือทั้งก้อน
    assert.equal(dailyTargetPercent(project({ progress: [progress("2026-08-09", 70)] }), "2026-08-12"), 30);
  });
});

describe("work projects — เตือนให้ส่ง progress วันละครั้ง (ใครก็ได้ในทีม)", () => {
  it("วันนี้ยังไม่มีใครส่ง = ต้องเตือน", () => {
    const p = project({ assignees: ["ICE", "LEO"], progress: [progress("2026-08-04", 30, "ICE")] });
    assert.equal(teamNeedsProgressToday(p, "2026-08-05"), true);
  });

  it("มีคนใดคนหนึ่งส่งแล้ว = วันนี้ครบ ไม่ต้องเตือนคนอื่นซ้ำ", () => {
    const p = project({ assignees: ["ICE", "LEO"], progress: [progress("2026-08-05", 30, "ICE")] });
    assert.equal(teamNeedsProgressToday(p, "2026-08-05"), false);
  });

  it("ยังไม่ถึงวันเริ่ม หรือปิดงานแล้ว ไม่ต้องเตือน — แต่เลยกำหนดแล้วยังต้องเตือนต่อ", () => {
    assert.equal(teamNeedsProgressToday(project(), "2026-07-25"), false);
    assert.equal(teamNeedsProgressToday(project({ status: "done" }), "2026-08-05"), false);
    assert.equal(teamNeedsProgressToday(project(), "2026-08-20"), true);
  });

  it("นับจำนวนครั้งที่ส่ง และบอกได้ว่าใครส่งบ้างในวันนั้น", () => {
    const p = project({
      progress: [
        progress("2026-08-05", 10, "ICE", "2026-08-05T03:00:00.000Z"),
        progress("2026-08-05", 20, "LEO", "2026-08-05T09:00:00.000Z"),
        progress("2026-08-05", 25, "ICE", "2026-08-05T15:00:00.000Z"),
        progress("2026-08-06", 30, "LEO")
      ]
    });
    assert.equal(progressCount(p), 4);
    assert.equal(progressCount(p, "2026-08-05"), 3);
    assert.deepEqual(progressAuthorsOn(p, "2026-08-05"), ["ICE", "LEO"]);
  });

  it("hasProgressOn ดูเฉพาะของคนนั้นได้", () => {
    const p = project({ progress: [progress("2026-08-05", 30, "LEO")] });
    assert.equal(hasProgressOn(p, "2026-08-05"), true);
    assert.equal(hasProgressOn(p, "2026-08-05", "ICE"), false);
    assert.equal(hasProgressOn(p, "2026-08-05", "LEO"), true);
  });
});

describe("work projects — ไทม์ไลน์รายวัน", () => {
  it("วันที่ผ่านไปแล้วไม่มีใครอัปเดต = missed, วันข้างหน้า = future", () => {
    const days = projectDays(project({ progress: [progress("2026-08-01", 10)] }), "2026-08-03");
    assert.equal(days.length, 10);
    assert.equal(days[0].missed, false);
    assert.equal(days[1].missed, true); // 2 ส.ค. เงียบ
    assert.equal(days[2].isToday, true);
    assert.equal(days[3].isFuture, true);
  });

  it("% ของแต่ละวันคงค่าล่าสุดต่อเนื่อง ไม่ตกกลับเป็น 0 ในวันที่ไม่ได้อัปเดต", () => {
    const days = projectDays(project({ progress: [progress("2026-08-01", 25)] }), "2026-08-03");
    assert.equal(days[0].percent, 25);
    assert.equal(days[1].percent, 25);
  });
});

describe("work projects — ตรวจก่อนบันทึก", () => {
  it("ต้องมีชื่องาน วันที่ และคนรับผิดชอบ", () => {
    assert.equal(validateProjectDraft({ title: "", startDate: "2026-08-01", endDate: "2026-08-02", assignees: ["ICE"] }), "ต้องใส่ชื่องาน");
    assert.equal(validateProjectDraft({ title: "งาน", startDate: "x", endDate: "2026-08-02", assignees: ["ICE"] }), "ต้องเลือกวันเริ่มและวันสิ้นสุด");
    assert.equal(
      validateProjectDraft({ title: "งาน", startDate: "2026-08-05", endDate: "2026-08-01", assignees: ["ICE"] }),
      "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม"
    );
    assert.equal(
      validateProjectDraft({ title: "งาน", startDate: "2026-08-01", endDate: "2026-08-05", assignees: [] }),
      "ต้องเลือกผู้รับผิดชอบอย่างน้อย 1 คน"
    );
    assert.equal(validateProjectDraft({ title: "งาน", startDate: "2026-08-01", endDate: "2026-08-05", assignees: ["ICE"] }), null);
  });

  it("progress ต้องเขียนว่าทำอะไร และ % ต้องอยู่ในช่วง", () => {
    assert.equal(validateProgressInput({ percent: 20, note: " " }), "ต้องเขียนว่าวันนี้ทำอะไรไปบ้าง");
    assert.equal(validateProgressInput({ percent: 120, note: "ทำแล้ว" }), "เปอร์เซ็นต์ต้องอยู่ระหว่าง 0–100");
    assert.equal(validateProgressInput({ percent: 0, note: "เริ่มแล้ว" }), null);
  });
});

describe("work projects — ใครเห็นอะไร", () => {
  it("staff เห็นเฉพาะงานที่ตัวเองถูกมอบหมาย", () => {
    const mine = project({ id: "a", assignees: ["ICE"] });
    const other = project({ id: "b", assignees: ["LEO"] });
    assert.deepEqual(projectsForViewer([mine, other], { isAdmin: false, staffCode: "ICE" }).map((p) => p.id), ["a"]);
    assert.deepEqual(projectsForViewer([mine, other], { isAdmin: true, staffCode: null }).map((p) => p.id), ["a", "b"]);
    assert.deepEqual(projectsForViewer([mine, other], { isAdmin: false, staffCode: null }), []);
  });

  it("เรียงงานที่กำลังทำขึ้นก่อน แล้วดูวันสิ้นสุดที่ใกล้ที่สุด", () => {
    const rows = [
      project({ id: "done", status: "done", endDate: "2026-08-02" }),
      project({ id: "late", endDate: "2026-08-20" }),
      project({ id: "soon", endDate: "2026-08-05" })
    ];
    assert.deepEqual(sortProjects(rows).map((p) => p.id), ["soon", "late", "done"]);
  });
});
