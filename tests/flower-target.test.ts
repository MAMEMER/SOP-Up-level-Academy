import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_FLOWER_TARGET, billCounts, daysLeftInMonth, flowerMonthsSince, isFlowerMonth, leaderboard, sanitizeFlowerTarget, targetPetalsPerPerson
} from "../lib/flower-target.ts";

test("ค่าเริ่มต้น = 10% ของยอดขาย นับตั้งแต่วันที่มีระบบดอกไม้", () => {
  assert.equal(DEFAULT_FLOWER_TARGET.minPercentOfSales, 10);
  assert.equal(DEFAULT_FLOWER_TARGET.startDate, "2026-09-17");
});

test("เป้าต่อคน = % ของกลีบที่บิลทั้งเดือนแจกได้ ไม่หารจำนวนคน", () => {
  assert.equal(targetPetalsPerPerson(4949, 10), 494); // ยอดขาย 49,490 ฿ → 10% = 4,949 ฿ = 494 กลีบ
  assert.equal(targetPetalsPerPerson(1000, 12.5), 125);
  assert.equal(targetPetalsPerPerson(0, 10), 0);
  assert.equal(targetPetalsPerPerson(1000, 250), 1000); // เกิน 100% ถูกหนีบไว้
  assert.equal(targetPetalsPerPerson(1000, -5), 0);
});

test("sanitize — ของเสียกลับเป็นค่าที่ใช้ได้เสมอ", () => {
  assert.deepEqual(sanitizeFlowerTarget(null), DEFAULT_FLOWER_TARGET);
  const s = sanitizeFlowerTarget({ minPercentOfSales: "15", startDate: "bad", prize: "  บัตรหนัง  " });
  assert.equal(s.minPercentOfSales, 15);
  assert.equal(s.startDate, "2026-09-17");
  assert.equal(s.prize, "บัตรหนัง");
  assert.equal(sanitizeFlowerTarget({ minPercentOfSales: 0 }).minPercentOfSales, 0);
});

test("บิลนับเข้าเดือนตามเวลาไทย และไม่นับก่อนวันเริ่ม", () => {
  assert.equal(billCounts("2026-09-30T18:00:00.000Z", "2026-10", "2026-09-17"), true); // ตี 1 วันที่ 1 ต.ค. ไทย
  assert.equal(billCounts("2026-09-16T10:00:00.000Z", "2026-09", "2026-09-17"), false);
  assert.equal(billCounts("2026-09-17T10:00:00.000Z", "2026-09", "2026-09-17"), true);
  assert.equal(billCounts("", "2026-09", "2026-09-17"), false);
});

test("อันดับ — คนที่ยังได้ 0 ก็ติดอันดับ คะแนนเท่ากันอันดับเท่ากัน", () => {
  const rows = leaderboard(
    [{ code: "A", name: "เอ" }, { code: "B", name: "บี" }, { code: "C", name: "ซี" }, { code: "D", name: "ดี" }],
    new Map([["A", 50], ["B", 80], ["C", 50]])
  );
  assert.deepEqual(rows.map((r) => [r.staffCode, r.rank]), [["B", 1], ["C", 2], ["A", 2], ["D", 4]]);
  assert.equal(rows[3].netPetals, 0);
});

test("วันที่เหลือของเดือน นับวันนี้ด้วย", () => {
  assert.equal(daysLeftInMonth(Date.parse("2026-09-28T05:00:00Z")), 3);
  assert.equal(daysLeftInMonth(Date.parse("2026-09-30T18:00:00Z")), 31); // 1 ต.ค. ไทยแล้ว
});

test("เดือนย้อนหลัง — ตั้งแต่เริ่มระบบถึงเดือนนี้ ใหม่ก่อน ข้ามปีได้", () => {
  assert.deepEqual(flowerMonthsSince("2026-09-17", Date.parse("2026-10-01T03:00:00Z")), ["2026-10", "2026-09"]);
  assert.deepEqual(flowerMonthsSince("2026-09-17", Date.parse("2026-09-30T18:00:00Z")), ["2026-10", "2026-09"]); // 1 ต.ค. ไทย
  assert.deepEqual(flowerMonthsSince("2026-11-01", Date.parse("2027-01-10T03:00:00Z")), ["2027-01", "2026-12", "2026-11"]);
  assert.deepEqual(flowerMonthsSince("2026-11-01", Date.parse("2026-10-10T03:00:00Z")), []);
});

test("เดือนจาก query string ต้องเป็น YYYY-MM จริง", () => {
  assert.equal(isFlowerMonth("2026-09"), true);
  assert.equal(isFlowerMonth("2026-13"), false);
  assert.equal(isFlowerMonth("2026-9"), false);
  assert.equal(isFlowerMonth(undefined), false);
});
