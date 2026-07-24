import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isoWeekKey, monthKey, periodKeyFor, tasksFor } from "../lib/periodic-tasks.ts";

describe("periodic task keys", () => {
  it("derives the calendar month key", () => {
    assert.equal(monthKey("2026-07-23"), "2026-07");
  });

  it("derives an ISO-week key", () => {
    // 2026-07-23 is a Thursday in ISO week 30.
    assert.equal(isoWeekKey("2026-07-23"), "2026-W30");
  });

  it("keeps the same week key across a Mon–Sun span", () => {
    const mon = isoWeekKey("2026-07-20");
    const sun = isoWeekKey("2026-07-26");
    assert.equal(mon, sun);
  });

  it("routes periodKeyFor to the right key type", () => {
    assert.equal(periodKeyFor("monthly", "2026-07-23"), "2026-07");
    assert.equal(periodKeyFor("weekly", "2026-07-23"), "2026-W30");
  });

  it("returns non-empty task lists for both periods", () => {
    assert.ok(tasksFor("weekly").length > 0);
    assert.ok(tasksFor("monthly").length > 0);
  });
});
