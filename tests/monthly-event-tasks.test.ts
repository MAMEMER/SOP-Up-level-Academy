import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bangkokMonthKey,
  monthDeadline,
  monthEndKey,
  monthLabelTh,
  monthlyEventTasks,
  monthlyOccurrenceStatus,
  monthlyStockTasks,
  monthlyTaskOccurrences,
  monthlyTasks,
  occurrenceKey
} from "../lib/monthly-event-tasks.ts";

describe("monthly event tasks", () => {
  it("defines the two admin-assigned monthly events and five stock tasks", () => {
    assert.deepEqual(
      monthlyEventTasks.map((task) => task.id),
      ["monthly-event-booth", "monthly-event-large"]
    );
    assert.equal(monthlyEventTasks.every((task) => task.category === "event"), true);
    assert.equal(monthlyStockTasks.length, 5);
    assert.equal(monthlyStockTasks.every((task) => task.category === "stock"), true);
    // combined list keeps event first, then stock
    assert.equal(monthlyTasks.length, 7);
    assert.equal(monthlyTasks[0].id, "monthly-event-booth");
    assert.equal(monthlyTasks[2].category, "stock");
  });

  it("derives the Bangkok month key and Thai label", () => {
    assert.equal(bangkokMonthKey(new Date("2026-07-25T12:00:00+07:00")), "2026-07");
    // just before Bangkok midnight of the 1st is still the previous month
    assert.equal(bangkokMonthKey(new Date("2026-07-31T18:00:00Z")), "2026-08");
    assert.equal(monthLabelTh("2026-07"), "กรกฎาคม 2026");
    assert.equal(monthLabelTh("2026-12"), "ธันวาคม 2026");
  });

  it("computes the last day of the month", () => {
    assert.equal(monthEndKey("2026-07"), "2026-07-31");
    assert.equal(monthEndKey("2026-02"), "2026-02-28");
    assert.equal(monthEndKey("2028-02"), "2028-02-29"); // leap year
    assert.equal(monthEndKey("2026-04"), "2026-04-30");
  });

  it("sets the deadline at store close on the last day of the month", () => {
    // 2026-07-31 is a Friday (weekday) -> store closes 22:00
    const deadline = monthDeadline("2026-07");
    assert.equal(deadline.getTime(), new Date("2026-07-31T22:00:00+07:00").getTime());
  });

  it("defaults to not_started with no record while the month is ongoing", () => {
    const midMonth = new Date("2026-07-15T12:00:00+07:00");
    assert.equal(monthlyOccurrenceStatus("2026-07", "not_started", midMonth), "not_started");
    assert.equal(monthlyOccurrenceStatus("2026-07", "in_progress", midMonth), "in_progress");
  });

  it("marks unfinished work overdue only after the month deadline passes", () => {
    const afterDeadline = new Date("2026-08-01T09:00:00+07:00");
    assert.equal(monthlyOccurrenceStatus("2026-07", "not_started", afterDeadline), "overdue");
    assert.equal(monthlyOccurrenceStatus("2026-07", "in_progress", afterDeadline), "overdue");
    // submitted and done are terminal — never flip to overdue
    assert.equal(monthlyOccurrenceStatus("2026-07", "submitted", afterDeadline), "submitted");
    assert.equal(monthlyOccurrenceStatus("2026-07", "done", afterDeadline), "done");
  });

  it("builds one occurrence per task for the given month", () => {
    const now = new Date("2026-07-15T12:00:00+07:00");
    const occurrences = monthlyTaskOccurrences("2026-07", {}, undefined, now);
    assert.equal(occurrences.length, monthlyTasks.length);
    assert.equal(occurrences.every((occurrence) => occurrence.status === "not_started"), true);
    assert.equal(occurrences[0].monthLabel, "กรกฎาคม 2026");
    assert.equal(occurrences[0].deadlineKey, "2026-07-31");
  });

  it("reflects stored states in occurrence status", () => {
    const now = new Date("2026-07-15T12:00:00+07:00");
    const states = {
      [occurrenceKey("monthly-event-booth", "2026-07")]: "submitted" as const,
      [occurrenceKey("monthly-stock-count", "2026-07")]: "done" as const
    };
    const occurrences = monthlyTaskOccurrences("2026-07", states, undefined, now);
    const booth = occurrences.find((occurrence) => occurrence.taskId === "monthly-event-booth");
    const stock = occurrences.find((occurrence) => occurrence.taskId === "monthly-stock-count");
    assert.equal(booth?.status, "submitted");
    assert.equal(stock?.status, "done");
  });
});
