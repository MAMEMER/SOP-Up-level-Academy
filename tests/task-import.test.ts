import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeImportedSpecs, shiftsFromLabel, specsFromPeriod, timingFromLabel } from "../lib/task-import.ts";
import { normalizeScopeConfig, type ChecklistScopeConfig } from "../lib/checklist-overrides.ts";
import { sharedUnitIdFor, weeklyTasks } from "../lib/periodic-tasks.ts";
import type { WorkSpec } from "../lib/work-spec.ts";

function config(overrides: Partial<ChecklistScopeConfig> = {}): ChecklistScopeConfig {
  return normalizeScopeConfig({ overrides: {}, order: [], hidden: [], customUnits: [], ...overrides });
}

describe("ย้ายรายการเดิมเข้าระบบสั่งงาน — แปลงป้ายข้อความ", () => {
  it("อ่านกะจากป้ายเดิม", () => {
    assert.deepEqual(shiftsFromLabel("กะ 1"), ["s1"]);
    assert.deepEqual(shiftsFromLabel("กะ 1, กะ 2"), ["s1", "s2"]);
    assert.deepEqual(shiftsFromLabel("ทุกกะ"), []);
    assert.deepEqual(shiftsFromLabel(undefined), []);
  });

  it("อ่านเวลาเริ่ม-จบ จากป้ายข้อความเท่าที่อ่านออก", () => {
    assert.deepEqual(timingFromLabel("11:00-23:59"), { openTime: "11:00", dueTime: "23:59" });
    assert.deepEqual(timingFromLabel("ก่อน 12:00"), { dueTime: "12:00" });
    assert.deepEqual(timingFromLabel("ภายใน 9:30"), { dueTime: "09:30" });
  });

  it("ป้ายที่อ่านเป็นเวลาไม่ได้ ไม่เดามั่ว (ไม่งั้นไปล็อกไม่ให้พนักงานส่งงาน)", () => {
    assert.deepEqual(timingFromLabel("งานประจำสัปดาห์ · ตามเวลาเปิด-ปิดร้าน"), {});
    assert.deepEqual(timingFromLabel(""), {});
  });
});

describe("ย้ายรายการเดิมเข้าระบบสั่งงาน — สร้างงาน", () => {
  it("รายการ built-in ของสัปดาห์ ย้ายมาครบ เป็นงานรายสัปดาห์", () => {
    const specs = specsFromPeriod("weekly", config());
    assert.equal(specs.length, weeklyTasks.length);
    assert.equal(specs[0].schedule.frequency, "weekly");
    assert.equal(specs[0].title, weeklyTasks[0].title);
    assert.equal(specs[0].detail, weeklyTasks[0].hint);
    assert.equal(specs[0].active, true);
  });

  it("หัวข้อกลายเป็นหมวดหมู่ · id ไม่ชนกันข้ามความถี่", () => {
    const weekly = specsFromPeriod("weekly", config());
    const monthly = specsFromPeriod("monthly", config());
    assert.equal(weekly[0].category, "งานประจำสัปดาห์ที่ช่วยกันทำ");
    assert.equal(monthly[0].schedule.frequency, "monthly");
    assert.equal(weekly.some((spec) => monthly.some((other) => other.id === spec.id)), false);
  });

  it("ของที่เจ้าของแก้ไว้ (ชื่อ/เวลา/กะ/แบบส่งงาน) ย้ายมาด้วย", () => {
    const unitId = sharedUnitIdFor("weekly");
    const specs = specsFromPeriod(
      "weekly",
      config({
        overrides: {
          [unitId]: {
            title: "งานสัปดาห์นี้",
            timeLabel: "ก่อน 12:00",
            shiftLabel: "กะ 1",
            items: [
              { id: "w-count", title: "นับ Sleeve", answer: { kind: "number", placeholder: "ใส่จำนวน" }, shiftLabel: "กะ 2" }
            ]
          }
        }
      })
    );
    assert.equal(specs.length, 1);
    assert.equal(specs[0].category, "งานสัปดาห์นี้");
    assert.deepEqual(specs[0].timing, { dueTime: "12:00" });
    assert.deepEqual(specs[0].owners.shifts, ["s2"]); // กะของรายการชนะกะของหัวข้อ
    assert.deepEqual(specs[0].answer, { kind: "number", placeholder: "ใส่จำนวน" });
  });

  it("หัวข้อที่เพิ่มเองย้ายมาด้วย · หัวข้อที่ปิดไว้ไม่ต้องย้าย", () => {
    const sharedId = sharedUnitIdFor("weekly");
    const specs = specsFromPeriod(
      "weekly",
      config({
        customUnits: [{ id: "custom-clean", title: "ทำความสะอาดใหญ่" }],
        overrides: { "custom-clean": { items: [{ id: "c1", title: "ถูพื้นโซนเล่น" }] } },
        hidden: [sharedId]
      })
    );
    assert.deepEqual(specs.map((spec) => spec.title), ["ถูพื้นโซนเล่น"]);
    assert.equal(specs[0].category, "ทำความสะอาดใหญ่");
  });
});

describe("ย้ายซ้ำได้โดยไม่ซ้ำงาน", () => {
  const incoming: WorkSpec[] = [
    { id: "weekly-a", title: "งาน A", schedule: { frequency: "weekly" }, owners: {}, timing: {}, active: true, order: 0 },
    { id: "weekly-b", title: "งาน B", schedule: { frequency: "weekly" }, owners: {}, timing: {}, active: true, order: 1 }
  ];

  it("ครั้งแรกเพิ่มครบ", () => {
    const result = mergeImportedSpecs([], incoming);
    assert.equal(result.added, 2);
    assert.deepEqual(result.tasks.map((spec) => spec.order), [0, 1]);
  });

  it("กดซ้ำไม่เพิ่มอะไร และไม่ทับของที่แก้ไปแล้วหลังย้าย", () => {
    const edited: WorkSpec[] = [{ ...incoming[0], title: "งาน A (แก้แล้ว)", answer: { kind: "photo" } }];
    const result = mergeImportedSpecs(edited, incoming);
    assert.equal(result.added, 1); // เพิ่มเฉพาะ B
    assert.equal(result.tasks[0].title, "งาน A (แก้แล้ว)");
    assert.deepEqual(result.tasks[0].answer, { kind: "photo" });
  });
});
