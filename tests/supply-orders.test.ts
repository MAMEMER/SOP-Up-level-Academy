import test from "node:test";
import assert from "node:assert/strict";
import {
  awaitingDelivery,
  backorderItems,
  findPending,
  followUpClosed,
  itemProblemText,
  mismatchAlertText,
  normaliseItems,
  parseReadOrder,
  pendingSupplies,
  supplyCounts,
  supplyState,
  type SupplyOrder
} from "../lib/supply-orders.ts";

function order(patch: Partial<SupplyOrder> = {}): SupplyOrder {
  return {
    id: "o1",
    branch: "bangkae",
    supplier: "Makro",
    orderedDate: "2026-10-05",
    photos: ["https://firebasestorage.googleapis.com/x.jpg"],
    items: [
      { id: "a", name: "น้ำดื่มสิงห์ 600ml", qty: 6, unit: "แพ็ค", productId: "p-water" },
      { id: "b", name: "ทิวลี่ ช็อกโกแลต", qty: 3 }
    ],
    createdBy: "UP-001",
    createdAt: "2026-10-05T03:00:00.000Z",
    ...patch
  };
}

test("state: waiting → receiving → done when everything matches", () => {
  assert.equal(supplyState(order()), "waiting");
  const half = order({ items: [{ ...order().items[0], check: "ok" }, order().items[1]] });
  assert.equal(supplyState(half), "receiving");
  const allOk = order({
    items: order().items.map((item) => ({ ...item, check: "ok" as const })),
    receivedDate: "2026-10-06"
  });
  assert.equal(supplyState(allOk), "done");
  assert.equal(supplyState(order({ cancelled: true })), "cancelled");
});

test("state: mismatch needs contact, then follow-up until the next step closes", () => {
  const items = [
    { ...order().items[0], check: "short" as const, receivedQty: 4 },
    { ...order().items[1], check: "ok" as const }
  ];
  const received = order({ items, receivedDate: "2026-10-06" });
  assert.equal(supplyState(received), "contact");

  const contacted = { ...received, followUp: { contactedAt: "t", contactedBy: "UP-001" } };
  assert.equal(supplyState(contacted), "followup");

  const refund = { ...received, followUp: { contactedAt: "t", nextStep: "refund" as const, outcome: "คืนเงิน" } };
  assert.equal(supplyState(refund), "followup");
  assert.equal(supplyState({ ...refund, followUp: { ...refund.followUp, doneAt: "t2" } }), "done");

  const resend = { ...received, followUp: { contactedAt: "t", nextStep: "resend" as const, outcome: "ส่งตาม" } };
  assert.equal(followUpClosed(resend.followUp), true);
  assert.equal(supplyState(resend), "done");
});

test("backorder carries only what is still owed", () => {
  const received = order({
    items: [
      { id: "a", name: "น้ำ", qty: 6, check: "short", receivedQty: 4 },
      { id: "b", name: "ขนม", qty: 3, check: "missing" },
      { id: "c", name: "ซอง", qty: 2, check: "over", receivedQty: 3 },
      { id: "d", name: "ทิชชู่", qty: 1, check: "ok" }
    ],
    receivedDate: "2026-10-06"
  });
  const back = backorderItems(received, (index) => `n${index}`);
  assert.deepEqual(
    back.map((item) => [item.name, item.qty]),
    [
      ["น้ำ", 2],
      ["ขนม", 3]
    ]
  );
});

test("pending supplies: only orders not yet received, and only unchecked items", () => {
  const waiting = order();
  const receiving = order({ id: "o2", items: [{ id: "x", name: "ซองใส", qty: 1, check: "ok" }, { id: "y", name: "กล่องเด็ค", qty: 2 }] });
  const done = order({ id: "o3", items: [{ id: "z", name: "ขนมปัง", qty: 1, check: "ok" }], receivedDate: "2026-10-06" });
  assert.equal(awaitingDelivery(done), false);
  const pending = pendingSupplies([waiting, receiving, done]);
  assert.deepEqual(
    pending.map((entry) => entry.name),
    ["น้ำดื่มสิงห์ 600ml", "ทิวลี่ ช็อกโกแลต", "กล่องเด็ค"]
  );
});

test("findPending: productId first, then name — short names never match loosely", () => {
  const pending = pendingSupplies([order()]);
  assert.equal(findPending({ productId: "p-water", name: "อะไรก็ได้" }, pending)?.orderId, "o1");
  assert.equal(findPending({ name: "ทิวลี่ ช็อกโกแลต" }, pending)?.name, "ทิวลี่ ช็อกโกแลต");
  assert.equal(findPending({ name: "ทิวลี่ช็อกโกแลต 35g" }, pending)?.name, "ทิวลี่ ช็อกโกแลต");
  assert.equal(findPending({ name: "น้ำ" }, pending), undefined);
  assert.equal(findPending({ name: "เป๊ปซี่" }, pending), undefined);
});

test("normaliseItems rejects an empty list and clamps qty", () => {
  assert.ok(normaliseItems([], () => "x").error);
  assert.ok(normaliseItems([{ name: "  " }], () => "x").error);
  const { items } = normaliseItems([{ name: "น้ำ", qty: "0", unit: "แพ็ค" }], (i) => `id${i}`);
  assert.deepEqual(items, [{ id: "id0", name: "น้ำ", qty: 1, unit: "แพ็ค" }]);
});

test("parseReadOrder: pulls the JSON out of prose and drops unknown productIds", () => {
  const text = `ได้เลย\n{"supplier":"Makro","orderedDate":"2026-10-05","total":1234.5,"items":[{"name":"น้ำดื่ม","qty":6,"unit":"แพ็ค","productId":"p-water"},{"name":"ขนม","qty":"2","productId":"made-up"},{"name":"","qty":1}]}`;
  const result = parseReadOrder(text, new Set(["p-water"]));
  assert.equal(result.supplier, "Makro");
  assert.equal(result.total, 1234.5);
  assert.deepEqual(result.items, [
    { name: "น้ำดื่ม", qty: 6, unit: "แพ็ค", productId: "p-water" },
    { name: "ขนม", qty: 2 }
  ]);
  assert.deepEqual(parseReadOrder("ไม่มี json", new Set()).items, []);
});

test("problem text + counts + Telegram text", () => {
  assert.equal(itemProblemText({ id: "a", name: "น้ำ", qty: 6, check: "short", receivedQty: 4, checkNote: "แพ็คขาด" }), "ขาด (สั่ง 6 ได้ 4) · แพ็คขาด");
  const received = order({
    items: [{ id: "a", name: "น้ำ", qty: 6, check: "missing", checkNote: "ไม่มาเลย" }],
    receivedDate: "2026-10-06"
  });
  assert.deepEqual(supplyCounts([order(), received]), { waiting: 1, receiving: 0, contact: 1, followup: 0 });
  const message = mismatchAlertText(received, "บางแค");
  assert.match(message, /น้ำ: ไม่มา · ไม่มาเลย/);
  assert.doesNotMatch(message, /[*_[\]]/);
});
