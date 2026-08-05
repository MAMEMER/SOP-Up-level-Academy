import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { weeklyScopeKey } from "../lib/work-records.ts";
import { isoWeekKey } from "../lib/periodic-tasks.ts";
import {
  weeklyEventsActiveOn,
  weeklyEventProgressFromTicks,
  weeklyEventById
} from "../lib/weekly-event-tasks.ts";
import {
  tickKey,
  submitKey,
  weeklyEventPeriodKey
} from "../lib/weekly-event-store.ts";

// Regression (ticket IFn8JPMYUXum8QS8pI1a): the owner ops board showed 0 event ticks
// because staff wrote weekly-EVENT ticks under a per-DAY scope key while the summary read
// them under the ISO-WEEK scope key. These must be the same doc, and the tick keys the
// client writes must be exactly what the server-side summary reads back.
describe("weekly event ops summary reads what staff actually wrote", () => {
  const workDate = "2026-08-04"; // Tuesday → Gym pokemon is active (activeDays [2,5,6])
  const gym = weeklyEventById("weekly-event-gym-pokemon")!;

  it("Gym pokemon is active on 2026-08-04", () => {
    assert.ok(weeklyEventsActiveOn(workDate).some((event) => event.id === gym.id));
  });

  it("staff and owner agree on the event scope key (per-day, not ISO week)", () => {
    const staffScope = `${weeklyScopeKey(weeklyEventPeriodKey(workDate))}-event`;
    const ownerScope = `${weeklyScopeKey(workDate)}-event`;
    assert.equal(staffScope, ownerScope);
    // …and it is NOT the ISO-week scope the buggy summary used.
    assert.notEqual(staffScope, `${weeklyScopeKey(isoWeekKey(workDate))}-event`);
  });

  it("counts the exact checklist items the client ticked for that work date", () => {
    const periodKey = weeklyEventPeriodKey(workDate);
    // Simulate the client store: tick 4 of the 6 checklist items + submit.
    const ticks: Record<string, boolean> = {};
    for (const item of gym.checklist.slice(0, 4)) {
      ticks[tickKey(periodKey, gym.id, item.id)] = true;
    }
    const submitted: Record<string, boolean> = { [submitKey(periodKey, gym.id)]: true };

    const progress = weeklyEventProgressFromTicks(gym, workDate, ticks, submitted);
    assert.equal(progress.completed, 4);
    assert.equal(progress.total, gym.checklist.length);
    assert.equal(progress.submitted, true);
  });

  it("ticks written for a DIFFERENT day do not leak into this day's summary", () => {
    const ticks: Record<string, boolean> = {
      [tickKey("2026-08-05", gym.id, gym.checklist[0].id)]: true
    };
    const progress = weeklyEventProgressFromTicks(gym, workDate, ticks, {});
    assert.equal(progress.completed, 0);
  });
});
