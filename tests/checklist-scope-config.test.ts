import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  customUnitId,
  isUnitHidden,
  moveUnitItem,
  normalizeScopeConfig,
  orderedUnitIds,
  type ChecklistScopeConfig
} from "../lib/checklist-overrides.ts";
import {
  baseItemsFor,
  periodicTickKey,
  resolvePeriodicUnits,
  scopeForPeriod,
  sharedUnitIdFor,
  weeklyTasks
} from "../lib/periodic-tasks.ts";

function config(overrides: Partial<ChecklistScopeConfig> = {}): ChecklistScopeConfig {
  return normalizeScopeConfig({ overrides: {}, order: [], hidden: [], customUnits: [], ...overrides });
}

describe("checklist scope config (weekly/monthly แก้ได้เหมือน daily)", () => {
  it("เอกสารเก่าที่มีแค่ overrides ยังอ่านได้ ฟิลด์ใหม่เป็นค่าว่าง", () => {
    const parsed = normalizeScopeConfig({ overrides: { "unit-a": { title: "ชื่อใหม่" } } });
    assert.equal(parsed.overrides["unit-a"].title, "ชื่อใหม่");
    assert.deepEqual(parsed.order, []);
    assert.deepEqual(parsed.hidden, []);
    assert.deepEqual(parsed.customUnits, []);
  });

  it("ทิ้งหัวข้อที่เพิ่มเองแบบไม่มีชื่อ/ไม่มี id และตัดค่าซ้ำในลำดับ", () => {
    const parsed = normalizeScopeConfig({
      overrides: {},
      order: ["a", "a", "b"],
      hidden: ["b", "b"],
      customUnits: [
        { id: "custom-x", title: "งานเสริม" },
        { id: "", title: "ไม่มี id" },
        { id: "custom-y", title: "   " }
      ]
    });
    assert.deepEqual(parsed.order, ["a", "b"]);
    assert.deepEqual(parsed.hidden, ["b"]);
    assert.deepEqual(parsed.customUnits, [{ id: "custom-x", title: "งานเสริม" }]);
  });

  it("ลำดับที่เจ้าของจัดมาก่อน แล้วต่อด้วยหัวข้อที่ยังไม่เคยจัด", () => {
    const cfg = config({ order: ["b"], customUnits: [{ id: "custom-new", title: "งานใหม่" }] });
    assert.deepEqual(orderedUnitIds(["a", "b"], cfg), ["b", "a", "custom-new"]);
  });

  it("หัวข้อที่ปิดไว้ ตรวจได้ด้วย isUnitHidden", () => {
    const cfg = config({ hidden: ["a"] });
    assert.equal(isUnitHidden(cfg, "a"), true);
    assert.equal(isUnitHidden(cfg, "b"), false);
  });

  it("id ของหัวข้อที่เพิ่มเองไม่ชนกัน", () => {
    const first = customUnitId("งานคลัง");
    assert.equal(customUnitId("งานคลัง", [first]), `${first}-2`);
  });

  it("ย้ายรายการข้ามหัวข้อ — ออกจากต้นทาง ไปต่อท้ายปลายทาง", () => {
    const moved = moveUnitItem(
      { a: [{ id: "i1", title: "หนึ่ง" }, { id: "i2", title: "สอง" }], b: [{ id: "i3", title: "สาม" }] },
      { unitId: "a", index: 0 },
      "b"
    );
    assert.deepEqual(moved.a.map((item) => item.id), ["i2"]);
    assert.deepEqual(moved.b.map((item) => item.id), ["i3", "i1"]);
  });

  it("ย้ายแล้ว id ชนกับของปลายทาง ระบบตั้ง id ใหม่ให้ (ติ๊กไม่ปนกัน)", () => {
    const moved = moveUnitItem(
      { a: [{ id: "i1", title: "หนึ่ง" }], b: [{ id: "i1", title: "ของเดิม" }] },
      { unitId: "a", index: 0 },
      "b"
    );
    assert.deepEqual(moved.b.map((item) => item.id), ["i1", "i1-2"]);
  });

  it("ย้ายเข้าหัวข้อตัวเอง หรือ index ที่ไม่มีจริง = ไม่เปลี่ยนอะไร", () => {
    const before = { a: [{ id: "i1", title: "หนึ่ง" }] };
    assert.equal(moveUnitItem(before, { unitId: "a", index: 0 }, "a"), before);
    assert.equal(moveUnitItem(before, { unitId: "a", index: 9 }, "b"), before);
  });
});

describe("งานประจำสัปดาห์/เดือน ที่เจ้าของแก้ได้", () => {
  it("ยังไม่เคยแก้ = เห็นรายการ built-in ครบเหมือนเดิม", () => {
    const units = resolvePeriodicUnits("weekly", config());
    assert.equal(units.length, 1);
    assert.deepEqual(units[0].items.map((item) => item.id), weeklyTasks.map((task) => task.id));
  });

  it("เจ้าของแก้รายการแล้ว staff เห็นตามที่แก้", () => {
    const unitId = sharedUnitIdFor("weekly");
    const units = resolvePeriodicUnits(
      "weekly",
      config({ overrides: { [unitId]: { title: "งานสัปดาห์นี้", items: [{ id: "w-new", title: "เช็ดตู้โชว์" }] } } })
    );
    assert.equal(units[0].title, "งานสัปดาห์นี้");
    assert.deepEqual(units[0].items.map((item) => item.title), ["เช็ดตู้โชว์"]);
  });

  it("หัวข้อที่เพิ่มเองขึ้นให้ทีมติ๊ก และหัวข้อที่ปิดไว้หายไป", () => {
    const sharedId = sharedUnitIdFor("weekly");
    const units = resolvePeriodicUnits(
      "weekly",
      config({
        customUnits: [{ id: "custom-clean", title: "ทำความสะอาดใหญ่" }],
        overrides: { "custom-clean": { items: [{ id: "c1", title: "ถูพื้นโซนเล่น" }] } },
        hidden: [sharedId]
      })
    );
    assert.deepEqual(units.map((unit) => unit.id), ["custom-clean"]);
    assert.equal(units[0].title, "ทำความสะอาดใหญ่");
  });

  it("หัวข้อที่ไม่มีรายการเลย ไม่ต้องขึ้นให้รก", () => {
    const units = resolvePeriodicUnits("weekly", config({ customUnits: [{ id: "custom-empty", title: "ยังไม่ใส่" }] }));
    assert.deepEqual(units.map((unit) => unit.id), [sharedUnitIdFor("weekly")]);
  });

  it("คีย์ติ๊กของรายการ built-in ไม่เปลี่ยน (ประวัติเดิมไม่หาย) แต่หัวข้อใหม่แยก namespace", () => {
    assert.equal(periodicTickKey("weekly", sharedUnitIdFor("weekly"), "w-sleeve"), "w-sleeve");
    assert.equal(periodicTickKey("weekly", "custom-clean", "c1"), "custom-clean::c1");
  });

  it("weekly / monthly เก็บอยู่คนละ scope และมี base items ของตัวเอง", () => {
    assert.equal(scopeForPeriod("weekly"), "weekly-stock");
    assert.equal(scopeForPeriod("monthly"), "monthly-stock");
    assert.notDeepEqual(baseItemsFor("weekly"), baseItemsFor("monthly"));
  });

  it("hint ของรายการ built-in กลายเป็นรายละเอียดที่พนักงานอ่านได้", () => {
    const sleeve = baseItemsFor("weekly").find((item) => item.id === "w-sleeve");
    assert.equal(sleeve?.note, "เทียบกับ StoreHub");
  });
});
