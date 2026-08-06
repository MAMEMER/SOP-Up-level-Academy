import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTodayWorkBoard, todayWorkHeadline } from "../lib/today-work-board.ts";

const phase = (id: string, visualStatus: "white" | "green" | "orange" | "red" | "purple", completed = 0, total = 4) => ({
  id,
  title: `หัวข้อ ${id}`,
  timeLabel: "09:00-11:00",
  visualStatus,
  completed,
  total
});

describe("today work board", () => {
  it("merges every source into one list", () => {
    const { items, summary } = buildTodayWorkBoard({
      dailyPhases: [phase("open-store", "white")],
      stockTasks: [
        {
          key: "stock-sleeve-work",
          label: "Stock Sleeve/อุปกรณ์",
          href: "/checklist-weekly#stock-sleeve-work",
          statusText: "ถึงกำหนดวันนี้",
          overdueDays: 0,
          upcoming: false,
          submitted: false
        }
      ],
      weeklyEvents: [
        { id: "weekly-event-lorcana", name: "Lorcana", game: "Lorcana", href: "/weekly-task/lorcana", completed: 0, total: 6 }
      ],
      monthlyTasks: [
        { taskId: "monthly-event-booth", name: "ออกบูธ", href: "/monthly-tasks#monthly-event-booth", status: "not_started", monthLabel: "สิงหาคม 2026" }
      ],
      assignedRecords: [
        { id: "r1", title: "แพ็คของส่ง", href: "/assigned-work/r1", employeeName: "ICE", status: "needs_revision", showStatus: true }
      ],
      feedItems: [
        {
          id: "h1",
          origin: "handoff",
          title: "ลูกค้าฝากของ",
          href: "/handoff#h1",
          originLabel: "ส่งต่อจากกะปิดร้าน",
          statusText: "รอรับงาน",
          statusClass: "workflow-status-white"
        }
      ]
    });

    assert.equal(items.length, 6);
    assert.equal(summary.total, 6);
    assert.equal(summary.remaining, 6);
    assert.deepEqual(
      [...new Set(items.map((item) => item.kind))].sort(),
      ["assigned", "daily", "handoff", "monthly", "stock", "weekly"]
    );
  });

  it("ranks late work first, finished work last", () => {
    const { items } = buildTodayWorkBoard({
      dailyPhases: [phase("closed", "green", 4), phase("late", "red"), phase("now", "white")],
      stockTasks: [
        {
          key: "stock-single-card-work",
          label: "Stock Single card",
          href: "/checklist-monthly#stock-single-card-work",
          statusText: "กำหนด จันทร์ 10 ส.ค.",
          overdueDays: 0,
          upcoming: true,
          submitted: false
        }
      ]
    });

    assert.deepEqual(items.map((item) => item.state), ["overdue", "due", "upcoming", "done"]);
    assert.equal(items[0].title, "หัวข้อ late");
  });

  it("puts personally assigned work above the routine when both are due", () => {
    const { items } = buildTodayWorkBoard({
      dailyPhases: [phase("open-store", "white")],
      assignedRecords: [
        { id: "r1", title: "โพสต์ขอบคุณ", href: "/assigned-work/r1", employeeName: "ICE", status: "needs_revision", showStatus: true }
      ]
    });
    assert.equal(items[0].kind, "assigned");
    assert.equal(items[1].kind, "daily");
  });

  it("counts a submitted daily หัวข้อ as done even when it was handed in late", () => {
    const { summary } = buildTodayWorkBoard({ dailyPhases: [phase("stock-work", "orange", 4, 4)] });
    assert.equal(summary.done, 1);
    assert.equal(summary.remaining, 0);
  });

  it("keeps an unfinished หัวข้อ past its deadline on the list as late", () => {
    const { items, summary } = buildTodayWorkBoard({ dailyPhases: [phase("stock-work", "orange", 1, 4)] });
    assert.equal(items[0].state, "overdue");
    assert.equal(summary.overdue, 1);
  });

  it("hides the verdict from staff until the deadline passes", () => {
    const { items } = buildTodayWorkBoard({
      assignedRecords: [
        { id: "r1", title: "แพ็คของ", href: "/assigned-work/r1", employeeName: "ICE", status: "not_finished", showStatus: false }
      ]
    });
    assert.equal(items[0].statusText, "รอส่งงาน");
    assert.equal(items[0].statusClass, "workflow-status-white");
  });

  it("marks a finished weekly event done", () => {
    const { items } = buildTodayWorkBoard({
      weeklyEvents: [
        { id: "weekly-event-lorcana", name: "Lorcana", game: "Lorcana", href: "/weekly-task/lorcana", completed: 6, total: 6 }
      ]
    });
    assert.equal(items[0].state, "done");
    assert.equal(items[0].statusText, "เสร็จแล้ว · 6/6");
  });

  it("writes a headline that says what is left", () => {
    assert.equal(todayWorkHeadline({ total: 0, done: 0, remaining: 0, overdue: 0, dueToday: 0 }), "วันนี้ยังไม่มีงานที่ต้องทำ");
    assert.equal(todayWorkHeadline({ total: 5, done: 5, remaining: 0, overdue: 0, dueToday: 0 }), "เสร็จครบทั้ง 5 งานแล้ว");
    assert.equal(todayWorkHeadline({ total: 9, done: 5, remaining: 4, overdue: 1, dueToday: 3 }), "เหลือ 4 จาก 9 งาน · เลยเวลา 1");
  });

  it("returns an empty board when there is nothing at all", () => {
    const { items, summary } = buildTodayWorkBoard({});
    assert.deepEqual(items, []);
    assert.equal(summary.total, 0);
  });
});
