import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  isWeeklyEventActiveOn,
  weekdayOfWorkDate,
  weeklyEventById,
  weeklyEventDaysLabel,
  weeklyEvents,
  weeklyEventsActiveOn
} from "../lib/weekly-event-tasks.ts";

describe("weekly event scheduling (active days)", () => {
  it("computes weekday of a YYYY-MM-DD string without timezone drift", () => {
    // 2026-07-28 is a Tuesday
    assert.equal(weekdayOfWorkDate("2026-07-28"), 2);
    // 2026-08-02 is a Sunday
    assert.equal(weekdayOfWorkDate("2026-08-02"), 0);
    // 2026-07-29 is a Wednesday
    assert.equal(weekdayOfWorkDate("2026-07-29"), 3);
  });

  it("every weekly event declares at least one active day", () => {
    for (const event of weeklyEvents) {
      assert.ok(Array.isArray(event.activeDays));
      assert.ok(event.activeDays.length > 0, `${event.key} has no active days`);
      for (const day of event.activeDays) assert.ok(day >= 0 && day <= 6, `${event.key} has bad day ${day}`);
    }
  });

  it("Gym Pokemon is active on Tue/Fri/Sat only (อังคาร ศุกร์ เสาร์)", () => {
    const gym = weeklyEventById("weekly-event-gym-pokemon");
    assert.ok(gym);
    assert.deepEqual(gym!.activeDays, [2, 5, 6]);
    assert.equal(isWeeklyEventActiveOn(gym!, "2026-07-28"), true); // Tuesday
    assert.equal(isWeeklyEventActiveOn(gym!, "2026-07-29"), false); // Wednesday
    assert.equal(isWeeklyEventActiveOn(gym!, "2026-07-31"), true); // Friday
  });

  it("Lorcana is active Wed–Sun (พุธ พฤหัส ศุกร์ เสาร์ อาทิตย์)", () => {
    const lorcana = weeklyEventById("weekly-event-lorcana");
    assert.ok(lorcana);
    assert.deepEqual([...lorcana!.activeDays].sort((a, b) => a - b), [0, 3, 4, 5, 6]);
    assert.equal(isWeeklyEventActiveOn(lorcana!, "2026-07-28"), false); // Tuesday → not due
    assert.equal(isWeeklyEventActiveOn(lorcana!, "2026-07-29"), true); // Wednesday
    assert.equal(isWeeklyEventActiveOn(lorcana!, "2026-08-02"), true); // Sunday
  });

  it("weeklyEventsActiveOn returns only the events due that weekday", () => {
    // Tuesday 2026-07-28 → only Gym Pokemon is due
    const tuesday = weeklyEventsActiveOn("2026-07-28").map((event) => event.key);
    assert.deepEqual(tuesday, ["gym-pokemon"]);
    // Monday 2026-07-27 → nothing due
    assert.deepEqual(weeklyEventsActiveOn("2026-07-27"), []);
  });

  it("labels active days in Thai", () => {
    const gym = weeklyEventById("weekly-event-gym-pokemon");
    assert.equal(weeklyEventDaysLabel(gym!), "อังคาร ศุกร์ เสาร์");
  });
});

describe("dashboard wires weekly events to assigned work + gray-out", () => {
  const source = readFileSync(new URL("../components/DashboardTaskSections.tsx", import.meta.url), "utf8");

  it("only active weekly events are injected into the assigned-work feed", () => {
    assert.equal(source.includes("isWeeklyEventActiveOn(event, workDate)"), true);
    assert.equal(source.includes("activeWeeklyEvents"), true);
    // active weekly events count toward the assigned-work non-empty check
    assert.equal(
      source.includes("assignedWorkRecords.length || assignedWorkFeed.length || activeWeeklyEvents.length"),
      true
    );
    // assigned weekly cards link to the submit/evidence page
    assert.equal(source.includes("href={weeklyEventHref(event.id)}"), true);
    assert.equal(source.includes("ส่งงาน/หลักฐาน"), true);
  });

  it("non-due weekly tasks render grayed-out (is-muted) and not as due", () => {
    assert.equal(source.includes("is-muted"), true);
    assert.equal(source.includes("ยังไม่ถึงกำหนด"), true);
  });
});
