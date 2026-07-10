import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { taskStartFromClockIn } from "../lib/task-clock.ts";

describe("task clock-in start time", () => {
  it("uses the employee clock-in time before the task open time", () => {
    assert.equal(
      taskStartFromClockIn("2026-07-04T01:55:00Z", "2026-07-04T02:10:00Z"),
      "2026-07-04T01:55:00Z"
    );
  });

  it("falls back to the task open time when no clock-in record exists", () => {
    assert.equal(taskStartFromClockIn(null, "2026-07-04T02:10:00Z"), "2026-07-04T02:10:00Z");
  });
});
