import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { performanceStatus, qualifiesForPurpleStreak } from "../lib/task-performance.ts";

describe("task performance status", () => {
  it("marks unstarted assigned work as red after login", () => {
    assert.equal(
      performanceStatus({
        assigned: true,
        loggedIn: true,
        startedAt: null,
        completedAt: null,
        dueSeconds: 600,
        completedChecklist: 0,
        totalChecklist: 4
      }),
      "red"
    );
  });

  it("marks complete on-time work as green", () => {
    assert.equal(
      performanceStatus({
        assigned: true,
        loggedIn: true,
        startedAt: "2026-07-04T09:00:00Z",
        completedAt: "2026-07-04T09:09:00Z",
        dueSeconds: 600,
        completedChecklist: 4,
        totalChecklist: 4
      }),
      "green"
    );
  });

  it("marks complete late work as orange", () => {
    assert.equal(
      performanceStatus({
        assigned: true,
        loggedIn: true,
        startedAt: "2026-07-04T09:00:00Z",
        completedAt: "2026-07-04T09:11:00Z",
        dueSeconds: 600,
        completedChecklist: 4,
        totalChecklist: 4
      }),
      "orange"
    );
  });

  it("marks more than three consecutive complete on-time workdays as purple", () => {
    assert.equal(qualifiesForPurpleStreak([true, true, true, true]), true);
    assert.equal(qualifiesForPurpleStreak([true, false, true, true]), false);
  });
});
