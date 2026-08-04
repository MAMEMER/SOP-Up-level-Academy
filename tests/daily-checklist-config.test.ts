import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cardStoreWorkflow, phasesForShift } from "../lib/card-store-workflow.ts";
import {
  applyChecklistConfig,
  applyPhaseOrder,
  applyPhaseShifts,
  resolvePhaseWindow,
  seedShiftsFromPhases,
  seedWindowsFromPhases
} from "../lib/daily-checklist.ts";
import { calculateChecklistScore } from "../lib/performance-score.ts";

const phaseIds = (phases: { id: string }[]) => phases.map((phase) => phase.id);

describe("owner checklist config", () => {
  it("keeps the built-in deadline until the owner sets one", () => {
    assert.equal(resolvePhaseWindow("open-store").dueTime, "13:00");
    assert.equal(resolvePhaseWindow("close-store").openTime, "19:00");
    assert.equal(resolvePhaseWindow("open-store", { "open-store": { dueTime: "10:30" } }).dueTime, "10:30");
    // กะ2 can have its own time for a หัวข้อ both shifts do
    assert.equal(resolvePhaseWindow("stock-work", {}, "s2").dueTime, "23:00");
    assert.equal(resolvePhaseWindow("stock-work", {}, "s1").dueTime, "13:00");
    // an unknown phase is held only to the end of the business day
    assert.equal(resolvePhaseWindow("brand-new-phase").dueTime, "23:59");
  });

  it("reorders หัวข้อ and leaves unlisted ones at the end", () => {
    const reordered = applyPhaseOrder(cardStoreWorkflow, ["close-store", "stock-work"]);

    assert.deepEqual(phaseIds(reordered).slice(0, 2), ["close-store", "stock-work"]);
    assert.equal(reordered.length, cardStoreWorkflow.length);
    // the ones the owner did not mention keep their built-in relative order
    assert.deepEqual(phaseIds(reordered).slice(2), ["open-store", "guild-chat-exp", "daytime-work"]);
  });

  it("moves a หัวข้อ between shifts, and an empty list means both shifts", () => {
    const moved = applyPhaseShifts(cardStoreWorkflow, { "open-store": ["s2"], "close-store": [] });

    assert.deepEqual(phaseIds(phasesForShift(moved, "s2")).includes("open-store"), true);
    assert.deepEqual(phaseIds(phasesForShift(moved, "s1")).includes("open-store"), false);
    // close-store cleared → shared, so both shifts see it
    assert.deepEqual(phaseIds(phasesForShift(moved, "s1")).includes("close-store"), true);
    assert.deepEqual(phaseIds(phasesForShift(moved, "s2")).includes("close-store"), true);
  });

  it("applies items, shifts and order together", () => {
    const applied = applyChecklistConfig(cardStoreWorkflow, {
      overrides: { "open-store": ["ข้อเดียวพอ"] },
      shifts: { "open-store": ["s1", "s2"] },
      order: ["open-store"]
    });

    assert.equal(phaseIds(applied)[0], "open-store");
    assert.deepEqual(applied[0].checklist, ["ข้อเดียวพอ"]);
    assert.deepEqual(applied[0].shift, ["s1", "s2"]);
  });

  it("seeds the editor from whatever the phases carry today", () => {
    const windows = seedWindowsFromPhases(cardStoreWorkflow, {});
    const shifts = seedShiftsFromPhases(cardStoreWorkflow, {});

    assert.equal(windows["close-store"].dueTime, "23:59");
    assert.equal(windows["open-store"].dueTime, "13:00");
    assert.deepEqual(shifts["open-store"], ["s1"]);
  });

  it("charges 2 points per หัวข้อ handed in late", () => {
    const result = calculateChecklistScore([
      { type: "late_submit", count: 3, dates: ["2026-08-03", "2026-08-04"], source: "live" }
    ]);

    assert.equal(result.score, 14);
    assert.equal(result.deductions[0].points, 6);
    assert.equal(result.flags.length, 0);
    assert.match(result.deductions[0].detail, /2026-08-03/);
  });
});
