import assert from "node:assert/strict";
import test from "node:test";
import {
  bangkokMonth, bloomLabel, monthlyTargetPetals, newestFirst, signedPetals, summarise, targetPercent,
  type FlowerReceived
} from "../lib/flower-garden.ts";

const item = (over: Partial<FlowerReceived> & { id: string }): FlowerReceived => ({
  kind: "flower", petals: 5, message: "", photos: [], rank: "", invoiceNumber: "", createdAt: "2026-09-19T05:00:00Z", ...over
});

test("ดอกไม้กับใบไม้แห้งหักล้างกัน จำนวนเท่ากันคนละเครื่องหมาย", () => {
  assert.equal(signedPetals({ kind: "flower", petals: 7 }), 7);
  assert.equal(signedPetals({ kind: "leaf", petals: 7 }), -7);
  const s = summarise([item({ id: "a", petals: 10 }), item({ id: "b", kind: "leaf", petals: 3 })]);
  assert.equal(s.petalsGiven, 10);
  assert.equal(s.petalsDocked, 3);
  assert.equal(s.netPetals, 7);
  assert.equal(s.bouquets, 1);
  assert.equal(s.leaves, 1);
});

test("เกณฑ์เดือน = ครึ่งหนึ่งของที่แจกได้ หารพนักงาน", () => {
  assert.equal(monthlyTargetPetals(1000, 5), 100); // 1000/2 = 500 → 5 คน = 100
  assert.equal(monthlyTargetPetals(999, 4), 124);  // ปัดลง ไม่ปัดขึ้นให้เกณฑ์สูงเกินจริง
  assert.equal(monthlyTargetPetals(0, 5), 0);
  assert.equal(monthlyTargetPetals(100, 0), 50);   // ไม่มีพนักงาน = หารด้วย 0 ไม่ได้ ใช้ 1
});

test("เทียบเกณฑ์ — เดือนที่ยังไม่มีบิลต้องไม่โชว์เปอร์เซ็นต์ลวง", () => {
  assert.equal(targetPercent(50, 100), 50);
  assert.equal(targetPercent(120, 100), 120);
  assert.equal(targetPercent(-5, 100), -5);
  assert.equal(targetPercent(10, 0), null);
});

test("ป้ายจำนวนรับค่าติดลบได้", () => {
  assert.equal(bloomLabel(12), "2 ดอก 2 กลีบ");
  assert.equal(bloomLabel(10), "2 ดอก");
  assert.equal(bloomLabel(-3), "−3 กลีบ");
  assert.equal(bloomLabel(0), "0 กลีบ");
});

test("เรียงใหม่ก่อน และตัดรอบเดือนตามเวลาไทย", () => {
  const rows = newestFirst([
    item({ id: "old", createdAt: "2026-09-01T00:00:00Z" }),
    item({ id: "new", createdAt: "2026-09-19T00:00:00Z" })
  ]);
  assert.deepEqual(rows.map((r) => r.id), ["new", "old"]);
  // 30 ก.ย. 18:00 UTC = 1 ต.ค. 01:00 ไทย → เป็นของเดือนถัดไป
  assert.equal(bangkokMonth("2026-09-30T18:00:00Z"), "2026-10");
  assert.equal(bangkokMonth("2026-09-30T16:00:00Z"), "2026-09");
});
