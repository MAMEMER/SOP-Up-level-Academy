import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  datesForWeekday,
  dateInMonth,
  taskPresets,
  taskPreset,
  gamePreset
} from "../lib/planner-activities.ts";

describe("recurring shift-planner activities", () => {
  it("lists all Tuesdays in a month for the weekly preset", () => {
    // Aug 2026: Tuesdays fall on 4, 11, 18, 25
    assert.deepEqual(datesForWeekday("2026-08", 2), [
      "2026-08-04",
      "2026-08-11",
      "2026-08-18",
      "2026-08-25"
    ]);
  });

  it("clamps a monthly task day to the last valid day of the month", () => {
    assert.equal(dateInMonth("2026-08", 5), "2026-08-05");
    assert.equal(dateInMonth("2026-02", 31), "2026-02-28"); // Feb clamps to 28
    assert.equal(dateInMonth("2026-04", 31), "2026-04-30"); // Apr clamps to 30
    assert.equal(dateInMonth("2026-08", 0), "2026-08-01"); // floor at 1
  });

  it("exposes the two Stock งานประจำ task presets with checklist links", () => {
    const sleeve = taskPreset("stock-sleeve-work");
    const single = taskPreset("stock-single-card-work");
    assert.ok(sleeve && single);
    assert.equal(sleeve.cadence, "weekly");
    assert.equal(sleeve.href, "/checklist-weekly#stock-sleeve-work");
    assert.equal(single.cadence, "monthly");
    assert.equal(single.href, "/checklist-monthly#stock-single-card-work");
    assert.equal(taskPresets.length, 2);
  });

  it("keeps game and task key namespaces separate", () => {
    // a task key must not resolve to a game preset (they share DayActivity.game)
    assert.equal(gamePreset("stock-sleeve-work"), undefined);
    assert.equal(taskPreset("pokemon"), undefined);
  });
});
