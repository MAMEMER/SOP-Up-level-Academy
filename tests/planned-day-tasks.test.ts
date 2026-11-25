import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  daysBetween,
  isoWeekBounds,
  isPlannedHref,
  monthBounds,
  plannedCadenceLabel,
  plannedStatusText,
  plannedTaskForHref,
  plannedTasksForPeriod,
  plannedTasksFromActivities,
  thaiDateLabel
} from "../lib/planned-day-tasks.ts";

const sleeve = (workDate: string) => ({
  workDate,
  activities: [{ game: "stock-sleeve-work", time: "", title: "Stock Sleeve/อุปกรณ์" }]
});
const singleCard = (workDate: string) => ({
  workDate,
  activities: [{ game: "stock-single-card-work", time: "" }]
});

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

  it("dedupes the same task dropped twice on one date", () => {
    assert.equal(
      plannedTasksFromActivities([{ game: "stock-sleeve-work" }, { game: "stock-sleeve-work" }]).length,
      1
    );
  });
});

describe("period bounds", () => {
  it("takes the ISO week as Monday through Sunday", () => {
    // 2026-08-06 is a Thursday → Mon 03 … Sun 09
    assert.deepEqual(isoWeekBounds("2026-08-06"), { start: "2026-08-03", end: "2026-08-09" });
    // a Sunday belongs to the week that started the previous Monday
    assert.deepEqual(isoWeekBounds("2026-08-09"), { start: "2026-08-03", end: "2026-08-09" });
  });

  it("takes the calendar month for monthly work", () => {
    assert.deepEqual(monthBounds("2026-08-06"), { start: "2026-08-01", end: "2026-08-31" });
    assert.deepEqual(monthBounds("2026-02-10"), { start: "2026-02-01", end: "2026-02-28" });
  });

  it("counts whole days between dates", () => {
    assert.equal(daysBetween("2026-08-03", "2026-08-06"), 3);
    assert.equal(daysBetween("2026-08-10", "2026-08-06"), -4);
  });
});

describe("work owed as of today", () => {
  it("keeps a weekly task on the dashboard after its planned day, with the day count", () => {
    // planned Monday, today is Thursday of the same week → still owed, 3 days late
    const tasks = plannedTasksForPeriod([sleeve("2026-08-03")], "2026-08-06");
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].dueDate, "2026-08-03");
    assert.equal(tasks[0].overdueDays, 3);
    assert.equal(tasks[0].upcoming, false);
    assert.equal(plannedStatusText(tasks[0], false), "เลยกำหนด 3 วัน · กำหนด จันทร์ 3 ส.ค.");
  });

  it("drops last week's occurrence — a new week starts clean", () => {
    // planned Mon 27 Jul; today Thu 6 Aug is a different ISO week
    assert.deepEqual(plannedTasksForPeriod([sleeve("2026-07-27")], "2026-08-06"), []);
  });

  it("shows a task planned later this week as upcoming, not late", () => {
    const tasks = plannedTasksForPeriod([sleeve("2026-08-07")], "2026-08-06");
    assert.equal(tasks[0].upcoming, true);
    assert.equal(tasks[0].overdueDays, 0);
    assert.equal(plannedStatusText(tasks[0], false), "กำหนด ศุกร์ 7 ส.ค.");
  });

  it("says ถึงกำหนดวันนี้ on the planned day", () => {
    const tasks = plannedTasksForPeriod([sleeve("2026-08-06")], "2026-08-06");
    assert.equal(plannedStatusText(tasks[0], false), "ถึงกำหนดวันนี้ · งานประจำสัปดาห์");
    assert.equal(plannedStatusText(tasks[0], true), "ส่งแล้ว · กำหนด พฤหัสบดี 6 ส.ค.");
  });

  it("keeps the occurrence still owed when a task repeats inside one period", () => {
    // monthly single card planned on the 3rd and the 17th; today is the 6th
    const tasks = plannedTasksForPeriod([singleCard("2026-08-03"), singleCard("2026-08-17")], "2026-08-06");
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].dueDate, "2026-08-03");
    assert.equal(tasks[0].overdueDays, 3);
  });

  it("keeps the soonest date when every occurrence is still ahead", () => {
    const tasks = plannedTasksForPeriod([singleCard("2026-08-17"), singleCard("2026-08-10")], "2026-08-06");
    assert.equal(tasks[0].dueDate, "2026-08-10");
    assert.equal(tasks[0].upcoming, true);
  });

  it("judges a monthly task over the whole month, not the week", () => {
    // planned 3 Aug, today 20 Aug — different week, same month → still owed
    const tasks = plannedTasksForPeriod([singleCard("2026-08-03")], "2026-08-20");
    assert.equal(tasks[0].overdueDays, 17);
    assert.deepEqual(plannedTasksForPeriod([singleCard("2026-07-27")], "2026-08-20"), []);
  });

  it("returns weekly and monthly work together, earliest first", () => {
    const tasks = plannedTasksForPeriod([sleeve("2026-08-05"), singleCard("2026-08-03")], "2026-08-06");
    assert.deepEqual(tasks.map((task) => task.key), ["stock-single-card-work", "stock-sleeve-work"]);
  });

  it("matches a stock card's checklist link to the task owed", () => {
    const tasks = plannedTasksForPeriod([singleCard("2026-08-03")], "2026-08-06");
    assert.equal(plannedTaskForHref(tasks, "/checklist-monthly#stock-single-card-work")?.overdueDays, 3);
    assert.equal(plannedTaskForHref(tasks, "/checklist-weekly#stock-sleeve-work"), undefined);
    assert.equal(isPlannedHref(tasks, "/checklist-monthly#stock-single-card-work"), true);
  });

  it("writes the planned date in Thai", () => {
    assert.equal(thaiDateLabel("2026-08-10"), "จันทร์ 10 ส.ค.");
    assert.equal(thaiDateLabel("2026-12-31"), "พฤหัสบดี 31 ธ.ค.");
  });
});
