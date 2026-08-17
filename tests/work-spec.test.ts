import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  groupByCategory,
  isDueOn,
  isForShift,
  isForStaff,
  lastDayOfMonth,
  monthDayOf,
  normalizeWorkSpec,
  ownerModeLabel,
  scheduleLabel,
  specsDueFor,
  timingLabel,
  timingStateAt,
  weekdayOf,
  type WorkSpec
} from "../lib/work-spec.ts";
import { weeklyEvents } from "../lib/weekly-event-tasks.ts";

function spec(overrides: Partial<WorkSpec> = {}): WorkSpec {
  return {
    id: "t1",
    title: "งานหนึ่ง",
    schedule: { frequency: "daily" },
    owners: {},
    timing: {},
    active: true,
    order: 1,
    ...overrides
  };
}

describe("work spec — ลงวันไหน", () => {
  it("ทุกวัน = ครบกำหนดทุกวัน", () => {
    assert.equal(isDueOn({ frequency: "daily" }, "2026-08-13"), true);
  });

  it("รายสัปดาห์ ลงเฉพาะวันที่เลือก (13 ส.ค. 2026 = พฤหัสบดี)", () => {
    assert.equal(weekdayOf("2026-08-13"), 4);
    assert.equal(isDueOn({ frequency: "weekly", weekdays: [4] }, "2026-08-13"), true);
    assert.equal(isDueOn({ frequency: "weekly", weekdays: [1, 6] }, "2026-08-13"), false);
  });

  it("รายสัปดาห์ที่ไม่เลือกวันเลย = ทำได้ทุกวันในสัปดาห์", () => {
    assert.equal(isDueOn({ frequency: "weekly" }, "2026-08-13"), true);
  });

  it("รายเดือน ลงตามวันที่ของเดือน · ไม่ตั้ง = วันที่ 1", () => {
    assert.equal(monthDayOf("2026-08-05"), 5);
    assert.equal(isDueOn({ frequency: "monthly", monthDays: [5, 20] }, "2026-08-05"), true);
    assert.equal(isDueOn({ frequency: "monthly", monthDays: [5, 20] }, "2026-08-06"), false);
    assert.equal(isDueOn({ frequency: "monthly" }, "2026-08-01"), true);
  });

  it("รายเดือนวันที่ 31 ในเดือนที่มี 30 วัน → ครบกำหนดวันสุดท้ายของเดือน (งานไม่หายทั้งเดือน)", () => {
    assert.equal(lastDayOfMonth("2026-09-30"), 30);
    assert.equal(isDueOn({ frequency: "monthly", monthDays: [31] }, "2026-09-30"), true);
    assert.equal(isDueOn({ frequency: "monthly", monthDays: [31] }, "2026-09-29"), false);
    // เดือนที่มี 31 วัน ยังลงวันที่ 31 ตามปกติ
    assert.equal(isDueOn({ frequency: "monthly", monthDays: [31] }, "2026-08-30"), false);
    assert.equal(isDueOn({ frequency: "monthly", monthDays: [31] }, "2026-08-31"), true);
  });

  it("ครั้งเดียว / ช่วงวันที่", () => {
    assert.equal(isDueOn({ frequency: "once", startDate: "2026-08-13" }, "2026-08-13"), true);
    assert.equal(isDueOn({ frequency: "once", startDate: "2026-08-13" }, "2026-08-14"), false);
    const range = { frequency: "range" as const, startDate: "2026-08-10", endDate: "2026-08-14" };
    assert.equal(isDueOn(range, "2026-08-10"), true);
    assert.equal(isDueOn(range, "2026-08-14"), true);
    assert.equal(isDueOn(range, "2026-08-15"), false);
  });

  it("สัปดาห์เว้นสัปดาห์ ลงทุก 2 สัปดาห์นับจากวันหมุด (เริ่ม 18 ส.ค. 2026)", () => {
    const biweekly = { frequency: "biweekly" as const, startDate: "2026-08-18" };
    assert.equal(weekdayOf("2026-08-18"), 2); // 18 ส.ค. 2026 = อังคาร
    assert.equal(isDueOn(biweekly, "2026-08-18"), true); // รอบแรก
    assert.equal(isDueOn(biweekly, "2026-08-25"), false); // สัปดาห์เว้น = ข้าม
    assert.equal(isDueOn(biweekly, "2026-09-01"), true); // +14 วัน
    assert.equal(isDueOn(biweekly, "2026-09-15"), true); // +28 วัน
    assert.equal(isDueOn(biweekly, "2026-09-08"), false); // สัปดาห์เว้น
    assert.equal(isDueOn(biweekly, "2026-08-19"), false); // คนละวันในสัปดาห์
  });

  it("สัปดาห์เว้นสัปดาห์ ก่อนวันหมุด = ยังไม่ต้องทำ · ไม่มีวันหมุด = ไม่ขึ้นวันไหนเลย", () => {
    assert.equal(isDueOn({ frequency: "biweekly", startDate: "2026-08-18" }, "2026-08-04"), false);
    assert.equal(isDueOn({ frequency: "biweekly" }, "2026-08-18"), false);
  });

  it("normalize เก็บวันหมุดของสัปดาห์เว้นสัปดาห์ไว้ (ไม่ถูกตัดทิ้ง)", () => {
    const clean = normalizeWorkSpec(
      { title: "งานเว้นสัปดาห์", schedule: { frequency: "biweekly", startDate: "2026-08-18" } },
      0
    );
    assert.equal(clean?.schedule.frequency, "biweekly");
    assert.equal(clean?.schedule.startDate, "2026-08-18");
  });

  it("อ่านออกว่าลงวันไหน", () => {
    assert.equal(scheduleLabel({ frequency: "daily" }), "ทุกวัน");
    assert.equal(scheduleLabel({ frequency: "weekly", weekdays: [1, 4] }), "ทุกสัปดาห์ · วันจ พฤ");
    assert.equal(scheduleLabel({ frequency: "biweekly", startDate: "2026-08-18" }), "ทุก 2 สัปดาห์ · วันอ · เริ่ม 2026-08-18");
    assert.equal(scheduleLabel({ frequency: "biweekly" }), "ทุก 2 สัปดาห์");
    assert.equal(scheduleLabel({ frequency: "monthly", monthDays: [5] }), "ทุกเดือน · วันที่ 5");
  });
});

describe("work spec — งานที่ผูกกับกิจกรรม", () => {
  it("ลงเองตามวันที่กิจกรรมนั้นจัด (Gym pokemon = อังคาร ศุกร์ เสาร์)", () => {
    const gym = weeklyEvents.find((event) => event.game.toLowerCase().includes("pokemon")) || weeklyEvents[0];
    const schedule = { frequency: "event" as const, eventKey: gym.key };
    const dueDay = gym.activeDays[0];
    // หาวันในเดือน ส.ค. 2026 ที่ตรงกับวันจัดกิจกรรมวันแรก
    const dates = Array.from({ length: 7 }, (_, i) => `2026-08-${String(10 + i).padStart(2, "0")}`);
    const match = dates.find((date) => weekdayOf(date) === dueDay)!;
    const miss = dates.find((date) => !gym.activeDays.includes(weekdayOf(date)))!;
    assert.equal(isDueOn(schedule, match), true);
    assert.equal(isDueOn(schedule, miss), false);
  });

  it("กิจกรรมที่ไม่รู้จัก = ไม่ขึ้นวันไหนเลย (ไม่เดา)", () => {
    assert.equal(isDueOn({ frequency: "event", eventKey: "ไม่มีอยู่จริง" }, "2026-08-13"), false);
  });

  it("ป้ายบอกว่าอิงกิจกรรมไหน", () => {
    const event = weeklyEvents[0];
    assert.equal(scheduleLabel({ frequency: "event", eventKey: event.key }), `ทุกวันที่มี ${event.name}`);
  });
});

describe("work spec — ใครทำ", () => {
  it("ไม่ระบุกะ = ทุกกะเห็น · ระบุกะเดียว = เห็นเฉพาะกะนั้น", () => {
    assert.equal(isForShift({}, "s1"), true);
    assert.equal(isForShift({ shifts: ["s1", "s2"] }, "s2"), true);
    assert.equal(isForShift({ shifts: ["s1"] }, "s2"), false);
    assert.equal(isForShift({ shifts: ["s1"] }, "s1"), true);
  });

  it("คนที่ยังไม่ได้ลงกะ ยังเห็นงานไว้อ้างอิง ไม่ถูกซ่อน", () => {
    assert.equal(isForShift({ shifts: ["s1"] }, null), true);
  });

  it("งานที่มอบหมาย เห็นเฉพาะคนที่ถูกระบุ", () => {
    assert.equal(isForStaff({ staffCodes: ["ICE"] }, "ICE"), true);
    assert.equal(isForStaff({ staffCodes: ["ICE"] }, "LEO"), false);
    assert.equal(isForStaff({}, "LEO"), true);
  });

  it("ป้ายบอกว่าเป็นงานเดี่ยว/กลุ่ม/งานประจำ", () => {
    assert.equal(ownerModeLabel({ staffCodes: ["ICE"] }), "งานเดี่ยว");
    assert.equal(ownerModeLabel({ staffCodes: ["ICE", "LEO"], mode: "group" }), "งานกลุ่ม");
    assert.equal(ownerModeLabel({ shifts: ["s1"] }), "งานประจำ");
  });
});

describe("work spec — เวลา", () => {
  it("ยังไม่ถึงเวลาเริ่ม / อยู่ในช่วง / เลยกำหนด", () => {
    const timing = { openTime: "09:00", dueTime: "12:00" };
    assert.equal(timingStateAt(timing, "08:59"), "before_open");
    assert.equal(timingStateAt(timing, "09:00"), "open");
    assert.equal(timingStateAt(timing, "12:00"), "open");
    assert.equal(timingStateAt(timing, "12:01"), "late");
  });

  it("ไม่ตั้งเวลาเลย = ทำได้ตลอดวัน", () => {
    assert.equal(timingStateAt({}, "23:59"), "anytime");
    assert.equal(timingLabel({}), "ได้ตลอดวัน");
    assert.equal(timingLabel({ dueTime: "12:00" }), "ภายใน 12:00");
    assert.equal(timingLabel({ openTime: "09:00", dueTime: "12:00" }), "09:00–12:00");
  });

  it("เวลาที่กรอกผิดรูปแบบ ไม่ทำให้งานล็อกทั้งวัน", () => {
    assert.equal(timingStateAt({ openTime: "9 โมง" }, "08:00"), "anytime");
  });
});

describe("work spec — งานของวันนี้", () => {
  const specs = [
    spec({ id: "a", order: 2, category: "เปิดร้าน", schedule: { frequency: "daily" }, owners: { shifts: ["s1"] } }),
    spec({ id: "b", order: 1, category: "เปิดร้าน", schedule: { frequency: "weekly", weekdays: [4] } }),
    spec({ id: "c", order: 3, category: "Stock", schedule: { frequency: "monthly", monthDays: [1] } }),
    spec({ id: "d", order: 4, active: false }),
    spec({ id: "e", order: 5, owners: { staffCodes: ["LEO"] } })
  ];

  it("กรองตามวัน กะ คน และงานที่ปิดไว้ แล้วเรียงตามลำดับที่จัดไว้", () => {
    const due = specsDueFor(specs, { date: "2026-08-13", shift: "s1", staffCode: "ICE" });
    assert.deepEqual(due.map((item) => item.id), ["b", "a"]);
  });

  it("กะ 2 ไม่เห็นงานของกะ 1 · คนที่ถูกมอบหมายเห็นงานตัวเอง", () => {
    assert.deepEqual(
      specsDueFor(specs, { date: "2026-08-13", shift: "s2", staffCode: "LEO" }).map((item) => item.id),
      ["b", "e"]
    );
  });

  it("จัดกลุ่มตามหมวดหมู่ โดยงานที่ไม่ได้ตั้งหมวด อยู่กลุ่ม 'ทั่วไป'", () => {
    const groups = groupByCategory(specsDueFor(specs, { date: "2026-08-01", shift: null, staffCode: "LEO" }));
    assert.deepEqual(groups.map((group) => group.category), ["เปิดร้าน", "Stock", "ทั่วไป"]);
  });
});
