import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPlannedHref,
  plannedCadenceLabel,
  plannedTasksFromActivities
} from "../lib/planned-day-tasks.ts";

describe("planned day tasks (ตารางกะ → dashboard)", () => {
  it("turns a Stock งานประจำ activity into a dashboard task", () => {
    const tasks = plannedTasksFromActivities([{ game: "stock-sleeve-work", time: "" }]);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].label, "Stock Sleeve/อุปกรณ์");
    assert.equal(tasks[0].href, "/checklist-weekly#stock-sleeve-work");
    assert.equal(plannedCadenceLabel(tasks[0]), "งานประจำสัปดาห์");
  });

  it("ignores game events — they surface as weekly-event cards already", () => {
    assert.deepEqual(plannedTasksFromActivities([{ game: "pokemon", time: "19:00" }]), []);
    assert.deepEqual(plannedTasksFromActivities(undefined), []);
    assert.deepEqual(plannedTasksFromActivities([]), []);
  });

  it("keeps only the work tasks when a day mixes game and stock activities", () => {
    const tasks = plannedTasksFromActivities([
      { game: "lorcana", time: "19:00" },
      { game: "stock-single-card-work" },
      { game: "riftbound", time: "19:00" }
    ]);
    assert.deepEqual(tasks.map((task) => task.key), ["stock-single-card-work"]);
    assert.equal(plannedCadenceLabel(tasks[0]), "งานประจำเดือน");
  });

  it("dedupes the same task dropped twice on one date", () => {
    const tasks = plannedTasksFromActivities([
      { game: "stock-sleeve-work" },
      { game: "stock-sleeve-work" }
    ]);
    assert.equal(tasks.length, 1);
  });

  it("keeps the chosen time when the planner set one", () => {
    const tasks = plannedTasksFromActivities([{ game: "stock-sleeve-work", time: "10:00" }]);
    assert.equal(tasks[0].time, "10:00");
  });

  it("matches a stock card's checklist link to a planned task", () => {
    const tasks = plannedTasksFromActivities([{ game: "stock-single-card-work" }]);
    assert.equal(isPlannedHref(tasks, "/checklist-monthly#stock-single-card-work"), true);
    assert.equal(isPlannedHref(tasks, "/checklist-weekly#stock-sleeve-work"), false);
    assert.equal(isPlannedHref([], "/checklist-monthly#stock-single-card-work"), false);
  });
});
