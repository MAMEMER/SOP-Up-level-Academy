import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SETTINGS,
  capacityMinutes,
  dailyItems,
  dayLoad,
  eventItems,
  formatHours,
  guessMinutes,
  itemKey,
  itemMinutes,
  loadLevel,
  normalizeEstimates,
  perPersonMinutes,
  staffMonth,
  taskItems,
  weekdayRows
} from "../lib/man-hours.ts";
import type { WorkSpec } from "../lib/work-spec.ts";

const phases = [
  { id: "open-store", title: "เปิดร้าน", shift: ["s1" as const], checklist: ["เปิดไฟ / แอร์", "ทำความสะอาดร้าน"] },
  { id: "stock-work", title: "Stock", shift: ["s1" as const, "s2" as const], checklist: ["นับจำนวนจริงหน้าร้าน"] },
  { id: "close-store", title: "ปิดร้าน", shift: ["s2" as const], checklist: ["ปิดยอดร้านและบันทึกเงินสด"] }
];

const spec = (over: Partial<WorkSpec>): WorkSpec => ({
  id: "t1",
  title: "นับ Sleeve",
  schedule: { frequency: "monthly", monthDays: [1] },
  owners: {},
  timing: {},
  active: true,
  order: 0,
  ...over
});

describe("man-hours", () => {
  it("keys are stable and Firestore-safe", () => {
    const key = itemKey("daily", "open-store", "เปิดไฟ / แอร์.");
    assert.equal(key, itemKey("daily", "open-store", " เปิดไฟ / แอร์. "));
    assert.match(key, /^daily_[0-9a-z]+$/);
    assert.notEqual(key, itemKey("daily", "close-store", "เปิดไฟ / แอร์."));
  });

  it("guesses minutes from the item text", () => {
    assert.equal(guessMinutes("ทำความสะอาดใหญ่พื้นที่เล่น"), 90);
    assert.equal(guessMinutes("ทำความสะอาดร้าน"), 30);
    assert.equal(guessMinutes("อะไรก็ไม่รู้"), 5);
  });

  it("owner estimate overrides the guess, times multiply", () => {
    const [item] = dailyItems(phases);
    assert.equal(itemMinutes(item, {}), 5);
    assert.equal(itemMinutes(item, { [item.key]: { minutes: 3, times: 4 } }), 12);
  });

  it("drops one-off, range, disabled and personally assigned tasks", () => {
    const items = taskItems(
      [
        spec({ id: "a" }),
        spec({ id: "b", schedule: { frequency: "once", startDate: "2026-10-18" } }),
        spec({ id: "c", schedule: { frequency: "range", startDate: "2026-10-01", endDate: "2026-10-03" } }),
        spec({ id: "d", active: false }),
        spec({ id: "e", owners: { staffCodes: ["UP-001"] } })
      ],
      () => "ทุกเดือน"
    );
    assert.deepEqual(items.map((item) => item.title), ["นับ Sleeve"]);
  });

  it("splits shift work by head count and pool work by everyone", () => {
    const items = [
      ...dailyItems(phases),
      ...taskItems([spec({ title: "งานรายเดือน" })], () => "ทุกเดือน")
    ];
    const est = Object.fromEntries(items.map((item) => [item.key, { minutes: 60, times: 1 }]));
    const cells = [
      { staffCode: "A", workDate: "2026-11-01", shift: "s1" as const },
      { staffCode: "B", workDate: "2026-11-01", shift: "s1" as const },
      { staffCode: "C", workDate: "2026-11-01", shift: "s2" as const }
    ];
    const load = dayLoad(items, est, DEFAULT_SETTINGS, "2026-11-01", cells);
    // s1: เปิดไฟ + ทำความสะอาด + นับ = 180 · s2: นับ + ปิดยอด = 120 · pool (วันที่ 1) = 60
    assert.deepEqual(load.shiftMinutes, { s1: 180, s2: 120 });
    assert.equal(load.poolMinutes, 60);
    assert.equal(perPersonMinutes(load, "s1"), 90 + 20);
    assert.equal(perPersonMinutes(load, "s2"), 120 + 20);

    const next = dayLoad(items, est, DEFAULT_SETTINGS, "2026-11-02", cells);
    assert.equal(next.poolMinutes, 0);
    assert.equal(perPersonMinutes(next, "s1"), 0);
  });

  it("event work only counts on event days and can be switched off", () => {
    const items = eventItems([{ key: "lorcana", name: "Lorcana", activeDays: [3], items: ["เตรียมพื้นที่เล่น"] }]);
    const wednesday = "2026-11-04";
    const thursday = "2026-11-05";
    assert.equal(dayLoad(items, {}, DEFAULT_SETTINGS, wednesday, []).poolMinutes, 15);
    assert.equal(dayLoad(items, {}, DEFAULT_SETTINGS, thursday, []).poolMinutes, 0);
    assert.equal(dayLoad(items, {}, { ...DEFAULT_SETTINGS, includeEvents: false }, wednesday, []).poolMinutes, 0);
  });

  it("monthly per-staff totals and weekday averages", () => {
    const items = dailyItems(phases);
    const est = Object.fromEntries(items.map((item) => [item.key, { minutes: 60, times: 1 }]));
    const cells = [
      { staffCode: "A", workDate: "2026-11-02", shift: "s1" as const },
      { staffCode: "A", workDate: "2026-11-03", shift: "s1" as const },
      { staffCode: "B", workDate: "2026-11-02", shift: "s2" as const }
    ];
    const loads = ["2026-11-02", "2026-11-03"].map((date) => dayLoad(items, est, DEFAULT_SETTINGS, date, cells));
    const rows = staffMonth(loads, 9, DEFAULT_SETTINGS);
    const a = rows.find((row) => row.staffCode === "A")!;
    assert.equal(a.shifts, 2);
    assert.equal(a.capacity, 2 * 480);
    assert.equal(a.work, 360);
    assert.equal(a.free, 600);
    const monday = weekdayRows(loads)[0];
    assert.equal(monday.weekday, 1);
    assert.deepEqual(monday.heads, { s1: 1, s2: 1 });
  });

  it("levels, capacity, formatting, sanitising", () => {
    assert.equal(capacityMinutes(9, DEFAULT_SETTINGS), 480);
    assert.equal(loadLevel(0.3), "light");
    assert.equal(loadLevel(0.6), "fit");
    assert.equal(loadLevel(0.9), "tight");
    assert.equal(loadLevel(1.2), "over");
    assert.equal(formatHours(135), "2 ชม. 15 นาที");
    assert.equal(formatHours(-30), "−30 นาที");
    assert.equal(formatHours(283 * 60 + 56), "284 ชม.");
    assert.deepEqual(normalizeEstimates({ daily_abc: { minutes: -4, times: 0 }, "bad.key": { minutes: 1 } }), {
      daily_abc: { minutes: 0, times: 1 }
    });
  });
});
