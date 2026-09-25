import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addStartOption,
  cleanStartList,
  defaultBranchShiftConfig,
  endTimeFor,
  MAX_START_OPTIONS,
  normalizeBranchShiftConfig,
  removeStartOption,
  startOptionLabel
} from "../lib/branch-shift-config.ts";

describe("เวลากะของแต่ละสาขา", () => {
  it("ค่าเริ่มต้นมาจากคอนฟิกสาขา — เสนาเฟสต์เข้า 09:30, บางแค 09:00", () => {
    assert.deepEqual(defaultBranchShiftConfig("senafest").starts.s1, ["09:30", "10:00"]);
    assert.deepEqual(defaultBranchShiftConfig("bangkae").starts.s1, ["09:00", "11:00"]);
    assert.equal(defaultBranchShiftConfig("senafest").closeTime, "22:00");
    assert.equal(defaultBranchShiftConfig("senafest").workHours, 9);
  });

  it("เพิ่มเวลาเองได้ เรียงให้อัตโนมัติ และกันเวลาซ้ำ", () => {
    let config = defaultBranchShiftConfig("senafest");
    config = addStartOption(config, "s1", "08:30");
    assert.deepEqual(config.starts.s1, ["08:30", "09:30", "10:00"]);
    config = addStartOption(config, "s1", "08:30");
    assert.deepEqual(config.starts.s1, ["08:30", "09:30", "10:00"]);
  });

  it("เวลาผิดรูปแบบไม่ถูกเพิ่ม", () => {
    const config = defaultBranchShiftConfig("senafest");
    assert.deepEqual(addStartOption(config, "s2", "25:00").starts.s2, config.starts.s2);
    assert.deepEqual(addStartOption(config, "s2", "9:3").starts.s2, config.starts.s2);
  });

  it("เก็บได้จำกัด ไม่ให้ dropdown ยาวจนเลือกไม่ถูก", () => {
    let config = defaultBranchShiftConfig("senafest");
    for (const time of ["06:00", "07:00", "08:00", "08:30", "11:00", "11:30", "12:00", "14:00"]) {
      config = addStartOption(config, "s1", time);
    }
    assert.equal(config.starts.s1.length, MAX_START_OPTIONS);
  });

  it("ลบเวลาได้ แต่ห้ามลบจนกะนั้นไม่เหลือเวลาเลย", () => {
    let config = defaultBranchShiftConfig("senafest");
    config = removeStartOption(config, "s1", "10:00");
    assert.deepEqual(config.starts.s1, ["09:30"]);
    config = removeStartOption(config, "s1", "09:30");
    assert.deepEqual(config.starts.s1, ["09:30"], "กะต้องเหลืออย่างน้อยหนึ่งเวลา");
  });

  it("เวลาเลิกงานคิดจากชั่วโมงทำงานของสาขา", () => {
    const config = defaultBranchShiftConfig("senafest");
    assert.equal(endTimeFor(config, "13:00"), "22:00");
    assert.equal(startOptionLabel(config, "09:30"), "09:30–18:30");
    assert.equal(endTimeFor({ ...config, workHours: 8 }, "13:00"), "21:00");
  });

  it("ค่าที่อ่านจากฐานข้อมูลถูกล้าง และกะที่ว่างถอยไปใช้ค่าเริ่มต้น", () => {
    const config = normalizeBranchShiftConfig("senafest", {
      starts: { s1: ["10:00", "10:00", "บ่ายสาม", "09:30"], s2: [] },
      closeTime: "ปิดดึก",
      workHours: 99
    });
    assert.deepEqual(config.starts.s1, ["09:30", "10:00"]);
    assert.deepEqual(config.starts.s2, ["12:30", "13:00"], "กะ 2 ว่าง → ใช้ค่าเริ่มต้น");
    assert.equal(config.closeTime, "22:00");
    assert.equal(config.workHours, 9);
  });

  it("cleanStartList ทิ้งค่าที่ไม่ใช่เวลา", () => {
    assert.deepEqual(cleanStartList(["09:00", 5, null, "24:00", "23:59"]), ["09:00", "23:59"]);
    assert.deepEqual(cleanStartList("ไม่ใช่ array"), []);
  });
});
