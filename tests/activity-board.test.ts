import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BOARD, dayWarnings, mondayOf, sanitizeBoard, weekDates, type BoardEvent } from "../lib/activity-board.ts";

const ev = (over: Partial<BoardEvent>): BoardEvent => ({
  id: "x", branch: "bangkae", day: 0, game: "pkm", title: "t", start: "19:00", dur: 3, fee: 0, cap: 0, ...over
});

test("mondayOf / weekDates — สัปดาห์เริ่มวันจันทร์", () => {
  assert.equal(mondayOf("2026-10-04"), "2026-09-28"); // อาทิตย์
  assert.equal(mondayOf("2026-10-05"), "2026-10-05");
  assert.deepEqual(weekDates("2026-09-28").slice(-1), ["2026-10-04"]);
});

test("เกมเดียวกันเวลาชนกันสองสาขา = แดง, คนละเวลา = เหลือง", () => {
  const clash = dayWarnings([ev({ id: "a" }), ev({ id: "b", branch: "senafest" })], 0);
  assert.equal(clash.flags.a, "bad");
  assert.equal(clash.warnings[0].level, "red");
  const apart = dayWarnings([ev({ id: "a", start: "13:00" }), ev({ id: "b", branch: "senafest", start: "18:00" })], 0);
  assert.equal(apart.flags.a, "meh");
});

test("ไม่มีคนอยู่ถึงงานจบ / ไม่มีคนเข้ากะ = แดง; ไม่มีแผนกะ = ไม่เตือน", () => {
  const events = [ev({ id: "a" })];
  const early = dayWarnings(events, 0, { bangkae: [{ code: "B", name: "B", shift: "s1", start: "09:30", end: "18:30" }], senafest: [] });
  assert.ok(early.warnings.some((w) => /ไม่มีคนอยู่ถึง 22:00/.test(w.text)));
  const none = dayWarnings(events, 0, { bangkae: [], senafest: [] });
  assert.ok(none.warnings.some((w) => /ไม่มีคนเข้ากะ/.test(w.text)));
  assert.equal(dayWarnings(events, 0, undefined).warnings.length, 0);
});

test("sanitizeBoard ตัดแถวพัง เก็บแถวดี", () => {
  const out = sanitizeBoard([...DEFAULT_BOARD, { id: "bad", branch: "x" }, { ...DEFAULT_BOARD[0] }]);
  assert.equal(out?.length, DEFAULT_BOARD.length);
  assert.equal(sanitizeBoard("nope"), null);
});
