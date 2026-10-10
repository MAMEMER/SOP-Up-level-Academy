import test from "node:test";
import assert from "node:assert/strict";
import {
  clashOn,
  feeLabel,
  groupByDate,
  matchesFilter,
  ourEventsByDate,
  sanitizeEvent,
  thaiDateLabel
} from "../lib/competitor-events.ts";
import { DEFAULT_BOARD, SPECIAL_DAYS } from "../lib/activity-board.ts";

const ev = (id: string, over: Record<string, unknown> = {}) => sanitizeEvent(id, { game: "pokemon", shop: "S", title: id, dates: [], ...over })!;

test("วันที่ภาษาไทยแบบสั้น", () => {
  assert.equal(thaiDateLabel("2026-10-17"), "ส. 17 ต.ค.");
  assert.equal(thaiDateLabel("2026-10-12"), "จ. 12 ต.ค.");
  assert.equal(thaiDateLabel("bad"), "bad");
});

test("ข้อมูลจากบอทหาย/เพี้ยน ไม่พัง", () => {
  const e = sanitizeEvent("doc1", { game: "mtg", dates: ["2026-10-20", "x", null, "2026-10-18", "2026-10-20"], feeThb: "abc", postUrl: "javascript:alert(1)" })!;
  assert.equal(e.id, "doc1");
  assert.equal(e.game, "other");
  assert.deepEqual(e.dates, ["2026-10-18", "2026-10-20"]);
  assert.equal(e.feeThb, null);
  assert.equal(e.postUrl, "");
  assert.equal(e.title, "");
  assert.equal(sanitizeEvent("x", null), null);
});

test("ค่าสมัคร: ตัวเลขก่อน ไม่มีค่อยใช้ข้อความ", () => {
  assert.equal(feeLabel({ feeThb: 1250, feeText: "x" }), "฿1,250");
  assert.equal(feeLabel({ feeThb: null, feeText: "300 รวม pack" }), "300 รวม pack");
  assert.equal(feeLabel({ feeThb: null, feeText: "" }), "");
});

test("จัดกลุ่มตามวัน: ตัดวันที่ผ่านแล้ว งานหลายวันโผล่ทุกวัน ไม่มีวันไปท้าย ตัดงานของเรา", () => {
  const groups = groupByDate(
    [
      ev("past", { dates: ["2026-10-01"] }),
      ev("league", { dates: ["2026-10-09", "2026-10-12", "2026-10-19"] }),
      ev("go", { dates: ["2026-10-17"] }),
      ev("nodate"),
      ev("mine", { dates: ["2026-10-17"], ours: true })
    ],
    "2026-10-10"
  );
  assert.deepEqual(
    groups.map((g) => [g.date, g.events.map((e) => e.id)]),
    [
      ["2026-10-12", ["league"]],
      ["2026-10-17", ["go"]],
      ["2026-10-19", ["league"]],
      [null, ["nodate"]]
    ]
  );
  assert.equal(groups.at(-1)?.label, "ยังไม่ระบุวัน");
});

test("ชนกัน: Grand Opening 17 ต.ค. เกมเดียวกัน = strong, เกมอื่น = soft, วันว่าง = ไม่มีป้าย", () => {
  const ours = ourEventsByDate(DEFAULT_BOARD, ["2026-10-17", "2026-10-17"], SPECIAL_DAYS);
  assert.deepEqual([...ours["2026-10-17"].games].sort(), ["lor", "pkm", "rb"]);
  assert.ok(ours["2026-10-17"].titles.includes("Grand Opening"));
  assert.ok(!ours["2026-10-17"].titles.includes("บางแคปิด 1 วัน"));
  assert.equal(clashOn("pokemon", ours["2026-10-17"]), "strong");
  assert.equal(clashOn("onepiece", ours["2026-10-17"]), "soft");
  assert.equal(clashOn("pokemon", undefined), null);
});

test("ชนกัน: วันธรรมดาใช้ตารางรายสัปดาห์ ไม่นับ Open Play", () => {
  // 2026-10-13 = อังคาร: บางแค Gym Battle (PKM), เสนาฯ Riftbound
  const tue = ourEventsByDate(DEFAULT_BOARD, ["2026-10-13"], [])["2026-10-13"];
  assert.equal(clashOn("riftbound", tue), "strong");
  assert.equal(clashOn("pokemon", tue), "strong");
  assert.equal(clashOn("lorcana", tue), "soft");
  // 2026-10-16 = ศุกร์: เสนาฯ มีแค่ Open Play, บางแค Lorcana/Tactic → Open Play ไม่โผล่ในชื่อ
  const fri = ourEventsByDate(DEFAULT_BOARD, ["2026-10-16"], [])["2026-10-16"];
  assert.ok(!fri.games.includes("open"));
});

test("กรอง: อื่นๆ รวม One Piece · เฉพาะกรุงเทพฯ · ไม่โชว์งานของเรา", () => {
  const op = ev("op", { game: "onepiece", bkk: true });
  const lor = ev("lor", { game: "lorcana", bkk: false });
  assert.ok(matchesFilter(op, "other", false));
  assert.ok(!matchesFilter(op, "pokemon", false));
  assert.ok(matchesFilter(lor, "lorcana", false));
  assert.ok(!matchesFilter(lor, "", true));
  assert.ok(!matchesFilter(ev("m", { ours: true }), "", false));
});
