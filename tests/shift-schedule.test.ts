import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SHIFT_START_OPTIONS,
  auditPlan,
  defaultShiftStart,
  findShiftImbalances,
  findUnderstaffedDays,
  isValidShiftStart,
  shiftEndTime,
  summariseStaff,
  type PlanCell
} from "../lib/shift-schedule.ts";

describe("shift time options", () => {
  it("exposes exactly the two allowed start times per shift", () => {
    assert.deepEqual(SHIFT_START_OPTIONS.s1, ["09:00", "11:00"]);
    assert.deepEqual(SHIFT_START_OPTIONS.s2, ["11:30", "13:00"]);
  });

  it("defaults to the first option of each shift", () => {
    assert.equal(defaultShiftStart("s1"), "09:00");
    assert.equal(defaultShiftStart("s2"), "11:30");
  });

  it("validates start times against the shift's dropdown", () => {
    assert.equal(isValidShiftStart("s1", "09:00"), true);
    assert.equal(isValidShiftStart("s1", "11:30"), false);
    assert.equal(isValidShiftStart("s2", "13:00"), true);
  });

  it("adds 9 hours to compute the end time, wrapping at midnight", () => {
    assert.equal(shiftEndTime("09:00"), "18:00");
    assert.equal(shiftEndTime("11:00"), "20:00");
    assert.equal(shiftEndTime("11:30"), "20:30");
    assert.equal(shiftEndTime("13:00"), "22:00");
  });
});

describe("per-staff summary", () => {
  const cells: PlanCell[] = [
    { staffCode: "ICE", workDate: "2026-08-01", assignment: "s1", startTime: "09:00" },
    { staffCode: "ICE", workDate: "2026-08-02", assignment: "s2", startTime: "13:00" },
    { staffCode: "ICE", workDate: "2026-08-03", assignment: "off" },
    { staffCode: "ICE", workDate: "2026-08-04", assignment: "leave_sick" },
    { staffCode: "Boom", workDate: "2026-08-01", assignment: "s2", startTime: "11:30" }
  ];

  it("counts work days, shifts, off, and leaves", () => {
    const ice = summariseStaff("ICE", cells);
    assert.equal(ice.totalWorkDays, 2);
    assert.equal(ice.s1Count, 1);
    assert.equal(ice.s2Count, 1);
    assert.equal(ice.offCount, 1);
    assert.equal(ice.sickLeave, 1);
    assert.equal(ice.personalLeave, 0);
    assert.equal(ice.shiftImbalance, 0);
  });
});

describe("balance audit", () => {
  it("flags days with fewer than two working staff, ignoring blank days", () => {
    const cells: PlanCell[] = [
      { staffCode: "ICE", workDate: "2026-08-01", assignment: "s1", startTime: "09:00" },
      { staffCode: "Boom", workDate: "2026-08-01", assignment: "off" },
      { staffCode: "ICE", workDate: "2026-08-02", assignment: "s1", startTime: "09:00" },
      { staffCode: "Boom", workDate: "2026-08-02", assignment: "s2", startTime: "11:30" }
    ];
    const dates = ["2026-08-01", "2026-08-02", "2026-08-03"];
    const issues = findUnderstaffedDays(cells, dates);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].ref, "2026-08-01");
  });

  it("flags a person stuck on one shift", () => {
    const summaries = [
      summariseStaff("ICE", [
        { staffCode: "ICE", workDate: "2026-08-01", assignment: "s1" },
        { staffCode: "ICE", workDate: "2026-08-02", assignment: "s1" },
        { staffCode: "ICE", workDate: "2026-08-03", assignment: "s1" },
        { staffCode: "ICE", workDate: "2026-08-04", assignment: "s1" },
        { staffCode: "ICE", workDate: "2026-08-05", assignment: "s1" }
      ])
    ];
    const issues = findShiftImbalances(summaries);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].ref, "ICE");
  });

  it("passes a balanced two-person plan", () => {
    const cells: PlanCell[] = [
      { staffCode: "ICE", workDate: "2026-08-01", assignment: "s1", startTime: "09:00" },
      { staffCode: "Boom", workDate: "2026-08-01", assignment: "s2", startTime: "11:30" },
      { staffCode: "ICE", workDate: "2026-08-02", assignment: "s2", startTime: "13:00" },
      { staffCode: "Boom", workDate: "2026-08-02", assignment: "s1", startTime: "09:00" }
    ];
    const issues = auditPlan(cells, ["2026-08-01", "2026-08-02"], ["ICE", "Boom"]);
    assert.deepEqual(issues, []);
  });
});
