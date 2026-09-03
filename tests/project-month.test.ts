import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultProjectMonth,
  isLatestMonth,
  isMonthKey,
  isRealDate,
  latestSelectableMonth,
  monthOfDate,
  monthRange,
  projectWorkDate,
  resolveProjectMonth,
  shiftMonth,
  splitProjectsByMonth,
  summarizeProjects,
  thaiMonthLabel
} from "../lib/project-month.ts";
import type { WorkProject } from "../lib/work-projects.ts";

const TODAY = "2026-09-03";

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
    createdAt: "2026-07-31T10:00:00.000Z",
    updatedAt: "2026-07-31T10:00:00.000Z",
    progress: [],
    ...overrides
  };
}

describe("ค่าเริ่มต้นของหน้างานที่มอบหมาย", () => {
  it("เปิดมาเป็นเดือนก่อนหน้า — อยู่ ก.ย. 2026 ต้องได้ ส.ค. 2026", () => {
    assert.equal(defaultProjectMonth(TODAY), "2026-08");
    assert.equal(latestSelectableMonth(TODAY), "2026-09");
  });

  it("ไม่มีค่าบน URL ก็ยังได้เดือนก่อนหน้า", () => {
    assert.equal(resolveProjectMonth(undefined, TODAY), "2026-08");
    assert.equal(resolveProjectMonth(null, TODAY), "2026-08");
    assert.equal(resolveProjectMonth("", TODAY), "2026-08");
  });

  it("ค่าที่เลือกถูกต้องใช้ตามนั้น", () => {
    assert.equal(resolveProjectMonth("2026-05", TODAY), "2026-05");
    assert.equal(resolveProjectMonth("2026-09", TODAY), "2026-09");
  });
});

describe("ย้อนเดือน / เดือนถัดไป", () => {
  it("ย้อนจากมกราคมต้องข้ามไปธันวาคมปีก่อน", () => {
    assert.equal(shiftMonth("2026-01", -1), "2025-12");
    assert.equal(shiftMonth("2026-01", -13), "2024-12");
  });

  it("เดินหน้าจากธันวาคมต้องข้ามไปมกราคมปีถัดไป", () => {
    assert.equal(shiftMonth("2025-12", 1), "2026-01");
  });

  it("ปุ่มเดือนถัดไปต้อง disabled เมื่ออยู่เดือนปัจจุบัน", () => {
    assert.equal(isLatestMonth("2026-09", TODAY), true);
    assert.equal(isLatestMonth("2026-08", TODAY), false);
  });
});

describe("กันการเลือกเดือนอนาคต", () => {
  it("เดือนอนาคตตกกลับไปเดือนก่อนหน้า", () => {
    assert.equal(resolveProjectMonth("2026-10", TODAY), "2026-08");
    assert.equal(resolveProjectMonth("2027-01", TODAY), "2026-08");
  });

  it("รูปแบบเพี้ยนก็ตกกลับไปเดือนก่อนหน้า", () => {
    for (const bad of ["2026-13", "2026-00", "สิงหาคม", "2026/08", "2026-8", "2026-08-19", 202608]) {
      assert.equal(resolveProjectMonth(bad, TODAY), "2026-08", `${String(bad)} ต้อง fallback`);
    }
  });

  it("isMonthKey รับเฉพาะ YYYY-MM ที่เป็นเดือนจริง", () => {
    assert.equal(isMonthKey("2026-08"), true);
    assert.equal(isMonthKey("2026-13"), false);
    assert.equal(isMonthKey("2026-00"), false);
  });
});

describe("ช่วงวันของเดือน", () => {
  it("วันแรกถึงวันสุดท้าย รวมเดือน 30/31 วันและปีอธิกสุรทิน", () => {
    assert.deepEqual(monthRange("2026-08"), { start: "2026-08-01", end: "2026-08-31" });
    assert.deepEqual(monthRange("2026-09"), { start: "2026-09-01", end: "2026-09-30" });
    assert.deepEqual(monthRange("2026-02"), { start: "2026-02-01", end: "2026-02-28" });
    assert.deepEqual(monthRange("2028-02"), { start: "2028-02-01", end: "2028-02-29" });
  });

  it("ป้ายเดือนเป็นภาษาไทย พ.ศ.", () => {
    assert.equal(thaiMonthLabel("2026-08"), "สิงหาคม 2569");
    assert.equal(thaiMonthLabel("2026-01"), "มกราคม 2569");
  });
});

describe("กรองงานตามเดือนที่เลือก", () => {
  const rows = [
    project({ id: "prev", startDate: "2026-07-31", endDate: "2026-08-02" }),
    project({ id: "first", startDate: "2026-08-01", endDate: "2026-08-01" }),
    project({ id: "mid", startDate: "2026-08-19", endDate: "2026-08-25" }),
    project({ id: "last", startDate: "2026-08-31", endDate: "2026-09-04" }),
    project({ id: "next", startDate: "2026-09-01", endDate: "2026-09-02" })
  ];

  it("เอาเฉพาะวันแรกถึงวันสุดท้ายของเดือน ไม่ปนเดือนอื่น", () => {
    const { inMonth, invalid } = splitProjectsByMonth(rows, "2026-08");
    assert.deepEqual(inMonth.map((row) => row.id), ["first", "mid", "last"]);
    assert.deepEqual(invalid, []);
  });

  it("เดือนอื่นเห็นเฉพาะงานของเดือนนั้น", () => {
    assert.deepEqual(
      splitProjectsByMonth(rows, "2026-09").inMonth.map((row) => row.id),
      ["next"]
    );
    assert.deepEqual(
      splitProjectsByMonth(rows, "2026-07").inMonth.map((row) => row.id),
      ["prev"]
    );
  });

  it("งานที่ไม่มีวันที่หรือวันที่เสีย ไม่ปนเข้ารายการ แต่ไปอยู่กลุ่มต้องตรวจสอบ", () => {
    const broken = [
      project({ id: "no-date", startDate: undefined as unknown as string }),
      project({ id: "junk", startDate: "ไม่ระบุ" }),
      project({ id: "fake-day", startDate: "2026-02-31" }),
      project({ id: "ok", startDate: "2026-08-05" })
    ];
    const { inMonth, invalid } = splitProjectsByMonth(broken, "2026-08");
    assert.deepEqual(inMonth.map((row) => row.id), ["ok"]);
    assert.deepEqual(invalid.map((row) => row.id), ["no-date", "junk", "fake-day"]);
  });

  it("workDate ของงานคือวันเริ่มงาน", () => {
    assert.equal(projectWorkDate(project({ startDate: "2026-08-05" })), "2026-08-05");
    assert.equal(projectWorkDate(project({ startDate: "2026-13-01" })), null);
    assert.equal(isRealDate("2026-02-29"), false);
    assert.equal(monthOfDate("2026-08-19"), "2026-08");
    assert.equal(monthOfDate("nope"), null);
  });
});

describe("ตัวเลขสรุปคิดจากเดือนที่เลือกเท่านั้น", () => {
  const rows = [
    project({ id: "aug-done", startDate: "2026-08-02", endDate: "2026-08-06", status: "done" }),
    project({ id: "aug-overdue", startDate: "2026-08-10", endDate: "2026-08-20", status: "active" }),
    project({ id: "aug-open", startDate: "2026-08-30", endDate: "2026-09-30", status: "active" }),
    project({ id: "aug-cancel", startDate: "2026-08-11", endDate: "2026-08-12", status: "cancelled" }),
    project({ id: "sep-open", startDate: "2026-09-01", endDate: "2026-09-30", status: "active" }),
    project({ id: "sep-done", startDate: "2026-09-02", endDate: "2026-09-02", status: "done" })
  ];

  it("สรุปเดือนสิงหาคม ไม่นับงานเดือนกันยายน", () => {
    const summary = summarizeProjects(splitProjectsByMonth(rows, "2026-08").inMonth, TODAY);
    assert.deepEqual(summary, { total: 4, done: 1, pending: 1, overdue: 1, cancelled: 1 });
  });

  it("สรุปเดือนกันยายน ไม่นับงานเดือนสิงหาคม", () => {
    const summary = summarizeProjects(splitProjectsByMonth(rows, "2026-09").inMonth, TODAY);
    assert.deepEqual(summary, { total: 2, done: 1, pending: 1, overdue: 0, cancelled: 0 });
  });

  it("งานที่ไม่มีวันที่ไม่ถูกนับในสรุปของเดือนไหนเลย", () => {
    const withBroken = [...rows, project({ id: "broken", startDate: "" })];
    const aug = summarizeProjects(splitProjectsByMonth(withBroken, "2026-08").inMonth, TODAY);
    assert.equal(aug.total, 4);
  });
});
