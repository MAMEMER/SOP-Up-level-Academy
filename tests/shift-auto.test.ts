import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateMonthPlan } from "../lib/shift-auto.ts";
import { summariseStaff, type PlanCell } from "../lib/shift-schedule.ts";

const CONFIG = {
  month: "2026-08",
  staff: [
    // staggered days-off so every day keeps ≥2 without pull-backs
    { code: "ICE", daysOff: [6], startShift: "s1" as const }, // off Saturday, starts กะ1
    { code: "Boom", daysOff: [0], startShift: "s2" as const }, // off Sunday
    { code: "Leo", daysOff: [3, 5] } // part-time: off Wed/Fri
  ]
};

describe("auto shift generator", () => {
  const cells = generateMonthPlan(CONFIG);

  it("seeds ICE on กะ1 on the first working day", () => {
    const iceFirst = cells.find((c) => c.staffCode === "ICE" && (c.assignment === "s1" || c.assignment === "s2"));
    assert.equal(iceFirst?.assignment, "s1");
    assert.equal(iceFirst?.startTime, "09:00");
  });

  it("gives ICE OFF every Saturday", () => {
    const iceSaturdays = cells.filter((c) => c.staffCode === "ICE" && new Date(`${c.workDate}T12:00:00+07:00`).getUTCDay() === 6);
    assert.ok(iceSaturdays.length > 0);
    assert.ok(iceSaturdays.every((c) => c.assignment === "off"));
  });

  it("mostly alternates each person's shift across working days", () => {
    const iceWork = cells
      .filter((c) => c.staffCode === "ICE" && (c.assignment === "s1" || c.assignment === "s2"))
      .map((c) => c.assignment);
    // Rotation is the default; a few repeats are allowed where coverage forced a flip.
    let repeats = 0;
    for (let i = 1; i < iceWork.length; i += 1) if (iceWork[i] === iceWork[i - 1]) repeats += 1;
    assert.ok(repeats <= 2, `too many non-alternating days: ${repeats}`);
  });

  it("keeps ≥2 people working every day", () => {
    const dates = [...new Set(cells.map((c) => c.workDate))];
    for (const date of dates) {
      const working = cells.filter((c) => c.workDate === date && (c.assignment === "s1" || c.assignment === "s2"));
      assert.ok(working.length >= 2, `${date} has ${working.length} working`);
    }
  });

  it("covers both กะ1 and กะ2 on days with ≥2 working", () => {
    const dates = [...new Set(cells.map((c) => c.workDate))];
    for (const date of dates) {
      const shifts = cells.filter((c) => c.workDate === date && (c.assignment === "s1" || c.assignment === "s2"));
      if (shifts.length >= 2) {
        assert.ok(shifts.some((c) => c.assignment === "s1"), `${date} missing กะ1`);
        assert.ok(shifts.some((c) => c.assignment === "s2"), `${date} missing กะ2`);
      }
    }
  });

  it("keeps each full-timer's กะ1/กะ2 split roughly balanced", () => {
    const ice = summariseStaff("ICE", cells as PlanCell[]);
    assert.ok(ice.shiftImbalance <= 3, `ICE imbalance ${ice.shiftImbalance}`);
  });
});
