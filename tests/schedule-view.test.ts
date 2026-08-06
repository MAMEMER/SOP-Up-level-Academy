import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildScheduleRows,
  calendarWeeks,
  monthDays,
  monthLabel,
  scheduleCell,
  shiftMonth,
  summaryLine,
  workingOn
} from "../lib/schedule-view.ts";
import type { PlanCell } from "../lib/shift-schedule.ts";

const staff = [
  { code: "ICE", displayName: "ICE" },
  { code: "BOOM", displayName: "Boom" },
  { code: "LEO", displayName: "Leo" }
];

const plan = (staffCode: string, workDate: string, assignment: PlanCell["assignment"], startTime?: string): PlanCell => ({
  staffCode,
  workDate,
  assignment,
  ...(startTime ? { startTime } : {})
});

describe("staff schedule — month days", () => {
  it("lists every day with a Thai weekday label", () => {
    const days = monthDays("2026-08");
    assert.equal(days.length, 31);
    assert.equal(days[0].workDate, "2026-08-01");
    assert.equal(days[0].weekdayLabel, "ส"); // 1 Aug 2026 = Saturday
    assert.equal(days[0].isWeekend, true);
    assert.equal(days[2].weekdayLabel, "จ"); // 3 Aug = Monday
    assert.equal(days[2].isWeekend, false);
  });

  it("handles February and month navigation", () => {
    assert.equal(monthDays("2026-02").length, 28);
    assert.equal(shiftMonth("2026-01", -1), "2025-12");
    assert.equal(shiftMonth("2026-12", 1), "2027-01");
    assert.equal(monthLabel("2026-08"), "สิงหาคม 2026");
  });
});

describe("staff schedule — cells", () => {
  it("prints the entry time on a working day and the full range in the tooltip data", () => {
    const cell = scheduleCell("2026-08-03", plan("ICE", "2026-08-03", "s1", "09:00"));
    assert.equal(cell.label, "09:00");
    assert.equal(cell.timeRange, "09:00-18:00");
    assert.equal(cell.tone, "s1");
  });

  it("falls back to each shift's default start when none was chosen", () => {
    assert.equal(scheduleCell("2026-08-03", plan("ICE", "2026-08-03", "s1")).label, "09:00");
    assert.equal(scheduleCell("2026-08-03", plan("ICE", "2026-08-03", "s2")).label, "11:30");
  });

  it("labels off days, leave and unplanned days", () => {
    assert.equal(scheduleCell("2026-08-04", plan("ICE", "2026-08-04", "off")).label, "หยุด");
    assert.equal(scheduleCell("2026-08-05", plan("ICE", "2026-08-05", "leave_sick")).label, "ลาป่วย");
    assert.equal(scheduleCell("2026-08-06", plan("ICE", "2026-08-06", "leave_personal")).label, "ลากิจ");
    const blank = scheduleCell("2026-08-07", undefined);
    assert.equal(blank.tone, "blank");
    assert.equal(blank.timeRange, null);
  });
});

describe("staff schedule — rows", () => {
  const days = monthDays("2026-08");
  const plans = [
    plan("ICE", "2026-08-03", "s1", "09:00"),
    plan("ICE", "2026-08-04", "off"),
    plan("BOOM", "2026-08-03", "s2", "13:00"),
    plan("LEO", "2026-08-03", "leave_sick")
  ];

  it("puts the signed-in staffer first, then the rest by name", () => {
    const rows = buildScheduleRows(staff, plans, days, "LEO");
    assert.deepEqual(rows.map((row) => row.staffCode), ["LEO", "BOOM", "ICE"]);
    assert.equal(rows[0].isMe, true);
  });

  it("keeps plain name order when the viewer is not on the roster", () => {
    const rows = buildScheduleRows(staff, plans, days, null);
    assert.deepEqual(rows.map((row) => row.displayName), ["Boom", "ICE", "Leo"]);
    assert.ok(rows.every((row) => !row.isMe));
  });

  it("summarises the month per person", () => {
    const rows = buildScheduleRows(staff, plans, days, "ICE");
    const mine = rows[0].summary;
    assert.equal(mine.totalWorkDays, 1);
    assert.equal(mine.offCount, 1);
    assert.equal(summaryLine(mine), "เข้างาน 1 วัน · กะ1 1 · กะ2 0 · หยุด 1");
    assert.match(summaryLine(rows.find((row) => row.staffCode === "LEO")!.summary), /ลา 1$/);
  });

  it("lists who works a given day, earliest first", () => {
    const rows = buildScheduleRows(staff, plans, days, "ICE");
    assert.deepEqual(workingOn(rows, "2026-08-03"), [
      { displayName: "ICE", timeRange: "09:00-18:00" },
      { displayName: "Boom", timeRange: "13:00-22:00" }
    ]);
    assert.deepEqual(workingOn(rows, "2026-08-09"), []);
  });
});

describe("staff schedule — calendar layout", () => {
  const days = monthDays("2026-08");
  const plans = [plan("ICE", "2026-08-03", "s1", "09:00"), plan("BOOM", "2026-08-03", "s2", "13:00")];
  const rows = buildScheduleRows(staff, plans, days, "ICE");
  const weeks = calendarWeeks(rows, days);

  it("pads the first week so the 1st sits under its weekday", () => {
    // 1 Aug 2026 is a Saturday → six blanks before it, Sunday-first
    assert.equal(weeks[0].filter((cell) => cell.day === null).length, 6);
    assert.equal(weeks[0][6].day?.workDate, "2026-08-01");
  });

  it("gives every week seven cells and covers the whole month", () => {
    assert.ok(weeks.every((week) => week.length === 7));
    const realDays = weeks.flat().filter((cell) => cell.day).length;
    assert.equal(realDays, 31);
  });

  it("carries who works each day plus the viewer's own shift", () => {
    const monday = weeks.flat().find((cell) => cell.day?.workDate === "2026-08-03");
    assert.equal(monday?.mine?.timeRange, "09:00-18:00");
    assert.deepEqual(monday?.working.map((entry) => entry.displayName), ["ICE", "Boom"]);
    assert.equal(monday?.working[0].isMe, true);
  });

  it("leaves a day with no roster empty", () => {
    const empty = weeks.flat().find((cell) => cell.day?.workDate === "2026-08-09");
    assert.deepEqual(empty?.working, []);
    // the viewer has a cell for every day of the month; an unplanned day is "blank"
    assert.equal(empty?.mine?.tone, "blank");
    assert.equal(empty?.mine?.timeRange, null);
  });
});
