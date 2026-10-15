import test from "node:test";
import assert from "node:assert/strict";
import {
  applyLot,
  applyFulfillment,
  fromLorcana13,
  fromMa6,
  fromMat,
  fromReservation,
  fromShop,
  isDone,
  isTodo,
  matchesFilter,
  matchesQuery,
  orderCounts,
  sheetDate,
  sortOrders,
  thaiDateIso
} from "../lib/customer-orders.ts";

test("MA6 row: deposit owes the remaining 980/box, pickup notes in column F count as handed over", () => {
  const row = ["7/1/2026 10:00:00", "สมชาย ใจดี", "ชาย", "081-234-5678", "3", "มารับเองที่ร้าน", "", "", "", "✅ ชำระมัดจำแล้ว", "VIP"];
  const o = fromMa6(row, 5)!;
  assert.equal(o.pay, "deposit");
  assert.equal(o.due, 3 * 980);
  assert.equal(o.hand, "to_hand");
  assert.equal(o.phone, "0812345678");
  assert.equal(o.key, "ma6__row5");
  assert.equal(isTodo(o), true);

  const picked = fromMa6([...row.slice(0, 5), "มารับแล้ว", "", "", "", "✅ ชำระครบแล้ว"], 6)!;
  assert.equal(picked.pay, "paid");
  assert.equal(picked.hand, "picked_up");
  assert.equal(isDone(picked), true);
});

test("MA6 refund with zero boxes is not a pending handover; over-quota rows are dropped", () => {
  const refund = fromMa6(["", "ก", "", "0811111111", "0", "มารับเองที่ร้าน", "", "", "", "✅ คืนมัดจำแล้ว 3 box"], 7)!;
  assert.equal(refund.pay, "refund");
  assert.equal(isTodo(refund), false);
  assert.equal(fromMa6(["", "ข", "", "0811111112", "41", "", "", "", "", "เกินโควต้า"], 8), null);
});

test("Lorcana 13: items come from the header columns, phase-2 clearance means paid, column W notes = picked up", () => {
  const header = ["Timestamp", "ชื่อ", "เบอร์", "วิธีรับ", "ที่อยู่", "Booster Box", "Playmat — \nMike", "x", "y", "z", "a", "b"];
  const row = Array(30).fill("");
  Object.assign(row, { 0: "5/21/2026 15:51:32", 1: "ปรียานันท์", 2: "0618519245", 3: "รับที่ร้าน", 5: "4", 6: "1", 14: "27500", 16: "13750", 20: "✅ มัดจำแล้ว", 22: "รับบ็อค,Port แล้ว", 28: "✅ เคลียร์รอบจัดสรร ก.ค. 2026" });
  const o = fromLorcana13(row, header, 2)!;
  assert.equal(o.items, "Booster Box ×4, Playmat — Mike ×1");
  assert.equal(o.pay, "paid");
  assert.equal(o.hand, "picked_up");
  assert.match(o.handText, /รับบ็อค/);
  assert.equal(o.createdAt, "2026-05-21T15:51:32+07:00");

  const owing = [...row];
  owing[22] = "";
  owing[28] = "";
  owing[25] = "5000";
  const d = fromLorcana13(owing, header, 3)!;
  assert.equal(d.pay, "deposit");
  assert.equal(d.due, 5000);
  assert.equal(d.hand, "to_hand");
});

test("Mega Tactic: TRUE in รับของ = picked up; arrival in the future = waiting for stock", () => {
  const row = ["6/20/2026 19:28:10", "MAT260620-1", "ทัต", "0832948050", "รับที่ร้าน", "-", "เมก้า (MATS) ×", "1", "1", "595", "", "17 ก.ค. 2026", "✅ สลิปผ่าน auto (595฿)", "TRUE"];
  assert.equal(fromMat(row, "2026-10-15")!.hand, "picked_up");
  const waiting = fromMat([...row.slice(0, 11), "20 พ.ย. 2026", row[12], "FALSE"], "2026-10-15")!;
  assert.equal(waiting.hand, "waiting_stock");
  assert.equal(isTodo(waiting), false);
  assert.equal(thaiDateIso("17 ก.ค. 2569"), "2026-07-17");
});

test("shop orders use the delivery task; rejected orders are hidden", () => {
  const o = fromShop({ id: "abcdefgh123", status: "confirmed", customer: { name: "เอ", phone: "081-000-0000", address: "กทม" }, items: [{ name: "Box", qty: 2 }], total: 500 })!;
  assert.equal(o.hand, "to_ship");
  assert.equal(isTodo(o), true);
  const shipped = fromShop({ id: "abcdefgh123", status: "confirmed" }, { id: "t1", orderId: "abcdefgh123", status: "shipped", trackingNumber: "TH123" })!;
  assert.equal(shipped.hand, "shipped");
  assert.match(shipped.handText, /TH123/);
  assert.equal(fromShop({ id: "x", status: "rejected" }), null);
  assert.equal(fromShop({ id: "y", status: "pending_review" })!.pay, "review");
});

test("reservations: expired holds vanish, prerelease seats never need a handover", () => {
  const now = Date.parse("2026-10-15T00:00:00Z");
  assert.equal(fromReservation("set14", { id: "a", status: "held", expiresAt: "2026-10-14T00:00:00Z" }, now), null);
  assert.equal(fromReservation("set14", { id: "b", status: "expired" }, now), null);
  const held = fromReservation("set14", { id: "c", status: "held", expiresAt: "2026-10-16T00:00:00Z", nickname: "บี" }, now)!;
  assert.equal(held.pay, "unpaid");
  const seat = fromReservation("prerelease", { id: "d", status: "paid" }, now)!;
  assert.equal(seat.hand, "not_needed");
  assert.equal(isDone(seat), true);
  const ship = fromReservation("set14", { id: "e", status: "paid", fulfillment: "ship" }, now)!;
  assert.equal(ship.hand, "to_ship");
});

test("stock not arrived parks pickup orders; a staff record beats what the sheet says", () => {
  const o = fromReservation("set14", { id: "f", status: "paid" })!;
  const parked = applyLot(o, "waiting");
  assert.equal(parked.hand, "waiting_stock");
  assert.equal(isTodo(parked), false);
  assert.equal(applyLot(o, "open").hand, "to_hand");
  const closed = applyLot(o, "closed");
  assert.equal(closed.hand, "picked_up");
  assert.equal(isDone(closed), true);
  const ship = fromReservation("set14", { id: "g", status: "paid", fulfillment: "ship" })!;
  assert.equal(applyLot(ship, "closed").hand, "shipped");

  const recorded = applyFulfillment(o, { state: "picked_up", by: "UP-001", byName: "ไอซ์", at: "2026-10-15T03:00:00Z" });
  assert.equal(recorded.hand, "picked_up");
  assert.match(recorded.handText, /ไอซ์/);
  const partial = applyFulfillment(o, { state: "partial", note: "รับบ็อคแล้ว เหลือเพลย์แมต", by: "x", at: "" });
  assert.equal(partial.hand, "to_hand");
  assert.match(partial.handText, /เหลือเพลย์แมต/);
});

test("search by phone tail, name or ref; filters and counts agree; todo sorts first", () => {
  const a = fromMa6(["7/1/2026", "สมชาย", "ชาย", "0812345678", "1", "มารับเองที่ร้าน", "", "", "", "✅ ชำระครบแล้ว"], 2)!;
  const b = fromMa6(["8/1/2026", "สมหญิง", "หญิง", "0899999999", "1", "มารับแล้ว", "", "", "", "✅ ชำระครบแล้ว"], 3)!;
  const c = fromReservation("set14", { id: "zz", status: "pending", nickname: "ซี" })!;
  assert.equal(matchesQuery(a, "5678"), true);
  assert.equal(matchesQuery(a, "081-234"), true);
  assert.equal(matchesQuery(b, "5678"), false);
  assert.equal(matchesQuery(b, "หญิง"), true);
  assert.equal(matchesQuery(c, "zz"), true);
  assert.deepEqual(orderCounts([a, b, c]), { todo: 1, review: 1, unpaid: 0, done: 1, all: 3 });
  assert.equal(matchesFilter(c, "review"), true);
  assert.equal(sortOrders([b, c, a])[0], a);
  assert.equal(sheetDate("not a date"), null);
});
