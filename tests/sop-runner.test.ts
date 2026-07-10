import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countCompletedTasks,
  findNextStep,
  formatDuration,
  isStepChecklistComplete,
  stepDurationMinutes
} from "../lib/sop-runner.ts";

describe("public SOP runner", () => {
  it("formats minutes into a compact timer label", () => {
    assert.equal(formatDuration(5), "05:00");
    assert.equal(formatDuration(75), "01:15:00");
  });

  it("uses explicit step durations before fallback durations", () => {
    assert.equal(stepDurationMinutes({ step_order: 1, duration_minutes: 12 }), 12);
    assert.equal(stepDurationMinutes({ step_order: 2 }), 10);
  });

  it("counts completed checklist tasks", () => {
    const checked = { "a": true, "b": false, "c": true };
    assert.equal(countCompletedTasks(checked), 2);
  });

  it("requires every checklist item in the active step before saving", () => {
    const step = { id: "open", step_order: 1, checklist_items: ["clean", "pos"] };

    assert.equal(isStepChecklistComplete(step, { "open:0": true }), false);
    assert.equal(isStepChecklistComplete(step, { "open:0": true, "open:1": true }), true);
  });

  it("finds the next SOP step by order", () => {
    const steps = [
      { id: "first", step_order: 1 },
      { id: "second", step_order: 2 }
    ];

    assert.equal(findNextStep(steps, steps[0])?.id, "second");
    assert.equal(findNextStep(steps, steps[1]), undefined);
  });
});
