import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checklistOutcomeKey,
  formatDuration,
  lineBotStaffRows,
  lineBotWindows,
  median,
  recentLineBotLog,
  resolveLineBotPerson,
  summarizeLineBot,
  toLineBotNudge,
  toLineBotQa,
  truncate,
  type ChecklistOutcomeMap,
  type LineBotStaffRef
} from "../lib/line-bot-report.ts";

const staff: LineBotStaffRef[] = [
  { code: "Boom", label: "บูม", employeeId: "UP-003", names: ["Boom", "บูม"] },
  { code: "Leo", label: "ลีโอ", employeeId: "UP-005", names: ["Leo"] }
];

const qa = (id: string, extra: Record<string, unknown>) =>
  toLineBotQa(id, { who: "Boom", staffCode: "UP-003", text: "ถาม", status: "answered", receivedAt: "2026-10-05T03:00:00Z", workDate: "2026-10-05", ...extra });
const nudge = (id: string, extra: Record<string, unknown>) =>
  toLineBotNudge(id, { who: "Boom", staffCode: "UP-003", kind: "checklist_soon", item: "open", workDate: "2026-10-05", due: "10:00", ...extra });

test("ช่วงก่อน/หลังบอท ยาวเท่ากัน", () => {
  const w = lineBotWindows("2026-10-07", 7);
  assert.equal(w.from, "2026-10-01");
  assert.equal(w.afterFrom, "2026-10-05");
  assert.equal(w.afterDays, 3);
  assert.equal(w.beforeFrom, "2026-10-02");
  assert.equal(w.beforeTo, "2026-10-04");
  const late = lineBotWindows("2026-11-30", 7);
  assert.equal(late.afterFrom, "2026-11-24");
  assert.equal(late.afterDays, 7);
  assert.equal(late.beforeFrom, "2026-09-28");
});

test("จับคนจากรหัส UP-xxx หรือชื่อ ไม่เจอ = who:", () => {
  assert.equal(resolveLineBotPerson("UP-005", "x", staff), "Leo");
  assert.equal(resolveLineBotPerson(null, "บูม", staff), "Boom");
  assert.equal(resolveLineBotPerson(null, "แชมป์", staff), "who:แชมป์");
});

test("สรุป: ค่ากลางเวลาตอบ นับล้มเหลว/ส่งต่อ", () => {
  const rows = [qa("a", { responseSec: 10 }), qa("b", { responseSec: 30 }), qa("c", { status: "failed", relayedToOwner: true })];
  const s = summarizeLineBot(rows, [nudge("n", {})]);
  assert.deepEqual(s, { questions: 3, answered: 2, failed: 1, relayed: 1, medianResponseSec: 20, nudges: 1 });
  assert.equal(median([]), null);
  assert.equal(summarizeLineBot([], []).medianResponseSec, null);
  assert.equal(formatDuration(45), "45 วิ");
  assert.equal(formatDuration(3700), "1 ชม. 2 นาที");
  assert.equal(truncate("abcdef", 4), "abc…");
});

test("ส่งทันหลังโดนเตือน: ไม่นับอันที่ยังไม่ถึงเวลา", () => {
  const outcomes: ChecklistOutcomeMap = new Map([
    [checklistOutcomeKey("Boom", "2026-10-05", "open"), "on_time"],
    [checklistOutcomeKey("Boom", "2026-10-05", "close"), "late"]
  ]);
  const rows = lineBotStaffRows({
    qa: [qa("a", {}), qa("b", { who: "แชมป์", staffCode: null })],
    nudges: [
      nudge("1", {}),
      nudge("2", { item: "close", due: "21:00" }),
      nudge("3", { item: "mid", due: "11:00" }), // ไม่ส่ง เลยเวลาแล้ว
      nudge("4", { item: "eve", due: "18:00" }), // ยังไม่ถึงเวลา
      nudge("5", { kind: "assigned_day", item: "p1" })
    ],
    staff,
    outcomes,
    lateBefore: new Map([["Boom", 4]]),
    lateAfter: new Map([["Boom", 1]]),
    todayDate: "2026-10-05",
    nowHHMM: "12:00"
  });
  const boom = rows.find((row) => row.key === "Boom")!;
  assert.equal(boom.questions, 1);
  assert.equal(boom.nudges, 5);
  assert.equal(boom.soonNudgesDue, 3);
  assert.equal(boom.soonNudgesOnTime, 1);
  assert.equal(boom.lateBefore, 4);
  assert.equal(boom.lateAfter, 1);
  assert.ok(rows.some((row) => row.key === "who:แชมป์" && row.questions === 1));
  assert.ok(rows.some((row) => row.key === "Leo" && row.questions === 0), "คนใน roster ขึ้นแม้ยังไม่มีข้อมูล");
});

test("ไม่มีข้อมูลเลยก็ไม่พัง", () => {
  const rows = lineBotStaffRows({ qa: [], nudges: [], staff: [], outcomes: new Map(), lateBefore: new Map(), lateAfter: new Map(), todayDate: "2026-10-05", nowHHMM: "09:00" });
  assert.deepEqual(rows, []);
  assert.deepEqual(recentLineBotLog([], staff, null), []);
});

test("log ใหม่สุดก่อน + กรองคน", () => {
  const rows = [qa("old", { receivedAt: "2026-10-05T01:00:00Z" }), qa("new", { receivedAt: "2026-10-05T05:00:00Z" }), qa("leo", { staffCode: "UP-005", who: "Leo" })];
  assert.deepEqual(recentLineBotLog(rows, staff, null).map((row) => row.id)[0], "new");
  assert.deepEqual(recentLineBotLog(rows, staff, "Leo").map((row) => row.id), ["leo"]);
  assert.equal(toLineBotQa("x", {}).status, "failed");
});
