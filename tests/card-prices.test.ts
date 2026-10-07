import test from "node:test";
import assert from "node:assert/strict";
import { confidence, feedbackError, searchRows, sortRows, summarize, type PriceFeedback, type RefRow } from "../lib/card-prices.ts";

const row = (over: Partial<RefRow>): RefRow => ({
  id: "x", key: "k", game: "pokemon", name: "Charizard ex", aka: "ลิซาร์ดอนex", img: "", set: "SV2a", number: "201",
  printing: true, lang: "TH", grade: "RAW", median: 1200, p25: 1000, p75: 1400, low: 900, high: 1500, n: 4,
  buy: null, nbuy: 0, trend: null, lastAt: 1, usd: null, samples: [], ...over
});

test("ค้นได้ทั้งชื่ออังกฤษ ชื่อไทย และเลขการ์ด", () => {
  const rows = [row({ id: "a" }), row({ id: "b", name: "Pikachu", aka: "พิคาชู", number: "25" }), row({ id: "c", game: "lorcana", name: "Elsa - Snow Queen", aka: "", number: "" })];
  assert.deepEqual(searchRows(rows, "charizard").map((r) => r.id), ["a"]);
  assert.deepEqual(searchRows(rows, "ลิซาร์ดอน").map((r) => r.id), ["a"]);
  assert.deepEqual(searchRows(rows, "201/165").map((r) => r.id), ["a"]);
  assert.deepEqual(searchRows(rows, "", "lorcana").map((r) => r.id), ["c"]);
});

test("ทักท้วง: แพง/ถูกไปต้องใส่ราคาที่ควรเป็น", () => {
  assert.equal(feedbackError("too_high", ""), "ใส่ราคาที่คิดว่าควรเป็นด้วย");
  assert.equal(feedbackError("too_low", "abc"), "ราคาที่เสนอต้องเป็นตัวเลขบาท");
  assert.equal(feedbackError("ok", ""), "");
  assert.equal(feedbackError("wrong_card", ""), "");
  assert.notEqual(feedbackError("nope", ""), "");
});

test("สรุปทักท้วง + เรียงใบที่โดนทักขึ้นก่อน", () => {
  const fb = (verdict: PriceFeedback["verdict"], suggest: number | null, status: "open" | "closed" = "open") =>
    ({ id: "", rowId: "a", key: "", name: "", verdict, suggest, note: "", byCode: "", byName: "", at: "", status }) as PriceFeedback;
  const s = summarize([fb("too_high", 900), fb("too_high", 1000), fb("too_low", 2000), fb("ok", null, "closed")]);
  assert.equal(s.open, 3);
  assert.equal(s.byVerdict.too_high, 2);
  assert.equal(s.suggestMedian, 1000);
  const sorted = sortRows([row({ id: "a", n: 1 }), row({ id: "b", n: 9 })], "flagged", new Map([["a", 2]]));
  assert.equal(sorted[0].id, "a");
  assert.equal(confidence(1).label, "ข้อมูลน้อย");
});
