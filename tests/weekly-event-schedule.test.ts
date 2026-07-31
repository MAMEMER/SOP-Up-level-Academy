import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  isWeeklyEventActiveOn,
  todayWorkDate,
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

  it("Rift Bound runs Wednesday and Eidolon runs Thursday", () => {
    const rift = weeklyEventById("weekly-event-riftbound");
    assert.ok(rift);
    assert.deepEqual(rift!.activeDays, [3]);
    assert.equal(isWeeklyEventActiveOn(rift!, "2026-07-29"), true); // Wednesday
    assert.equal(isWeeklyEventActiveOn(rift!, "2026-07-30"), false); // Thursday

    const eidolon = weeklyEventById("weekly-event-eidolon");
    assert.ok(eidolon);
    assert.deepEqual(eidolon!.activeDays, [4]);
    assert.equal(isWeeklyEventActiveOn(eidolon!, "2026-07-30"), true); // Thursday
    assert.equal(isWeeklyEventActiveOn(eidolon!, "2026-07-29"), false); // Wednesday
  });

  it("weeklyEventsActiveOn returns only the events due that weekday", () => {
    // Tuesday 2026-07-28 → only Gym Pokemon is due
    const tuesday = weeklyEventsActiveOn("2026-07-28").map((event) => event.key);
    assert.deepEqual(tuesday, ["gym-pokemon"]);
    // Wednesday 2026-07-29 → Lorcana + Rift Bound, in declaration order
    assert.deepEqual(weeklyEventsActiveOn("2026-07-29").map((event) => event.key), ["lorcana", "riftbound"]);
    // Thursday 2026-07-30 → Lorcana + Eidolon
    assert.deepEqual(weeklyEventsActiveOn("2026-07-30").map((event) => event.key), ["lorcana", "eidolon"]);
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

  it("non-due weekly cards are locked (rendered as a non-clickable div, not a link)", () => {
    // ปิดการกด: ถ้ายังไม่ active ต้องใช้ div (is-locked) แทน <a>
    assert.equal(source.includes("is-locked"), true);
    assert.equal(source.includes("if (!active)"), true);
  });
});

describe("weekly task pages lock un-scheduled events", () => {
  const listSource = readFileSync(
    new URL("../app/(dashboard)/weekly-task/page.tsx", import.meta.url),
    "utf8"
  );
  const detailSource = readFileSync(
    new URL("../app/(dashboard)/weekly-task/[event]/page.tsx", import.meta.url),
    "utf8"
  );

  it("listing page disables non-active events (is-locked, not a Link)", () => {
    assert.equal(listSource.includes("isWeeklyEventActiveOn(event, workDate)"), true);
    assert.equal(listSource.includes("is-locked"), true);
    assert.equal(listSource.includes("if (!active)"), true);
  });

  it("detail page gates the checklist server-side by today's Bangkok date", () => {
    assert.equal(detailSource.includes("todayWorkDate()"), true);
    assert.equal(detailSource.includes("isWeeklyEventActiveOn(event, workDate)"), true);
    // checklist ต้องอยู่ใต้เงื่อนไข active เท่านั้น
    assert.equal(detailSource.includes("active ? ("), true);
    assert.equal(detailSource.includes("ยังไม่ถึงกำหนด"), true);
  });
});

describe("todayWorkDate (Bangkok work date)", () => {
  it("formats a fixed instant as the Bangkok calendar date (YYYY-MM-DD)", () => {
    // 2026-07-27T20:00:00Z = 2026-07-28 03:00 Bangkok → ต้องได้วันที่ 28 (ไม่โดน UTC เลื่อน)
    assert.equal(todayWorkDate(new Date("2026-07-27T20:00:00Z")), "2026-07-28");
    // 2026-07-28T05:00:00Z = 2026-07-28 12:00 Bangkok
    assert.equal(todayWorkDate(new Date("2026-07-28T05:00:00Z")), "2026-07-28");
  });
});
