import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bangkokWeekday,
  occurrenceKey,
  occurrenceStatus,
  startOfWeekKey,
  weekDates,
  weeklyEventTasks,
  weeklyTaskOccurrences
} from "../lib/weekly-event-tasks.ts";

describe("weekly event tasks", () => {
  it("defines the three store weekly event tasks with correct weekdays", () => {
    const byId = Object.fromEntries(weeklyEventTasks.map((task) => [task.id, task]));
    // 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
    assert.deepEqual(byId["gym-pokemon"].weekdays, [2, 5, 6]);
    assert.deepEqual(byId["lorcana-core"].weekdays, [3, 4, 5, 6]);
    assert.deepEqual(byId["lorcana-pack-rush"].weekdays, [0]);
  });

  it("computes Bangkok weekday numbers", () => {
    // 2026-07-20 is a Monday
    assert.equal(bangkokWeekday("2026-07-20"), 1);
    assert.equal(bangkokWeekday("2026-07-25"), 6); // Saturday
    assert.equal(bangkokWeekday("2026-07-26"), 0); // Sunday
  });

  it("finds the Monday that starts the week", () => {
    assert.equal(startOfWeekKey("2026-07-25"), "2026-07-20"); // Sat -> Mon
    assert.equal(startOfWeekKey("2026-07-26"), "2026-07-20"); // Sun still same ISO week
    assert.equal(startOfWeekKey("2026-07-20"), "2026-07-20"); // Mon -> itself
  });

  it("lists 7 consecutive days for a week", () => {
    assert.deepEqual(weekDates("2026-07-20"), [
      "2026-07-20",
      "2026-07-21",
      "2026-07-22",
      "2026-07-23",
      "2026-07-24",
      "2026-07-25",
      "2026-07-26"
    ]);
  });

  it("marks future rounds as waiting, past rounds as overdue", () => {
    const midday = new Date("2026-07-22T12:00:00+07:00");
    assert.equal(occurrenceStatus("2026-07-25", "2026-07-22", false, midday), "waiting");
    assert.equal(occurrenceStatus("2026-07-21", "2026-07-22", false, midday), "overdue");
  });

  it("marks done rounds regardless of date", () => {
    const midday = new Date("2026-07-22T12:00:00+07:00");
    assert.equal(occurrenceStatus("2026-07-21", "2026-07-22", true, midday), "done");
    assert.equal(occurrenceStatus("2026-07-25", "2026-07-22", true, midday), "done");
  });

  it("today before close is not_started, after close is overdue", () => {
    // 2026-07-22 is Wednesday -> weekday store hours close 22:00
    const beforeClose = new Date("2026-07-22T18:00:00+07:00");
    const afterClose = new Date("2026-07-22T23:30:00+07:00");
    assert.equal(occurrenceStatus("2026-07-22", "2026-07-22", false, beforeClose), "not_started");
    assert.equal(occurrenceStatus("2026-07-22", "2026-07-22", false, afterClose), "overdue");
  });

  it("builds this week's occurrences only, sorted by date", () => {
    const today = "2026-07-22"; // Wednesday
    const now = new Date("2026-07-22T18:00:00+07:00");
    const occurrences = weeklyTaskOccurrences(today, new Set(), weeklyEventTasks, now);

    // week Mon 07-20 .. Sun 07-26
    // Tue(21): gym-pokemon | Wed(22): lorcana-core | Thu(23): lorcana-core
    // Fri(24): gym-pokemon + lorcana-core | Sat(25): gym-pokemon + lorcana-core | Sun(26): pack-rush
    const dates = occurrences.map((occurrence) => occurrence.dateKey);
    // sorted ascending
    assert.deepEqual([...dates].sort(), dates);

    const tueGym = occurrences.find((o) => o.dateKey === "2026-07-21" && o.taskId === "gym-pokemon");
    assert.ok(tueGym);
    assert.equal(tueGym.status, "overdue"); // Tuesday already passed

    const todayCore = occurrences.find((o) => o.dateKey === "2026-07-22" && o.taskId === "lorcana-core");
    assert.ok(todayCore);
    assert.equal(todayCore.isToday, true);
    assert.equal(todayCore.status, "not_started");

    const sunRush = occurrences.find((o) => o.taskId === "lorcana-pack-rush");
    assert.ok(sunRush);
    assert.equal(sunRush.dateKey, "2026-07-26");
    assert.equal(sunRush.status, "waiting");

    // no Monday occurrence (no task scheduled on Monday)
    assert.equal(occurrences.some((o) => o.dateKey === "2026-07-20"), false);
  });

  it("respects done keys when building occurrences", () => {
    const today = "2026-07-22";
    const now = new Date("2026-07-22T18:00:00+07:00");
    const done = new Set([occurrenceKey("lorcana-core", "2026-07-22")]);
    const occurrences = weeklyTaskOccurrences(today, done, weeklyEventTasks, now);
    const todayCore = occurrences.find((o) => o.dateKey === "2026-07-22" && o.taskId === "lorcana-core");
    assert.equal(todayCore?.status, "done");
  });
});
