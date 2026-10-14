import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizePhone, adaptOrder, adaptSheet, applyMovement, remaining, canDeliver, hash, type Balance } from "../lib/customer-handover.ts";
import { grantFor, authorized } from "../lib/customer-handover-access.ts";
const base: Balance = { entitlement: 3, delivered: 0, cancelled: 0, inTransit: 0, approved: true, fingerprint: "v1" };
describe("customer handover identity and adapters", () => {
  it("exact Thai phones normalize, short and suffix matches are rejected", () => {
    assert.equal(normalizePhone("+66 81-234-5678"), "0812345678");
    assert.equal(normalizePhone("66812345678"), "0812345678");
    assert.equal(normalizePhone("812345678"), "");
    assert.equal(normalizePhone("9990812345678"), "");
  });
  it("shield pieces include free pieces once, duplicate SKU occurrences remain distinct", () => {
    const lines = adaptOrder("shop-orders", "o1", { customer: { phone: "0812345678" }, status: "confirmed", slipStatus: "paid", items: [{ sku: "SHIELD", qty: 10, pieces: 11 }, { sku: "SHIELD", qty: 2, pieces: 2 }] });
    assert.equal(lines[0].entitlement, 11); assert.notEqual(lines[0].key, lines[1].key);
  });
  it("set14 paid row grants one physical unit, not reservation/payment copies", () => {
    const lines = adaptOrder("set14-orders", "o1", { phone: "0812345678", status: "paid", items: [{ productId: "box", name: "Box" }] });
    assert.equal(lines[0].entitlement, 1); assert.equal(lines[0].sourceKey, "set14-orders/o1");
  });
  it("digital shop products do not create physical entitlements", () => {
    assert.deepEqual(adaptOrder("shop_orders", "o1", { itemId: "role", effectType: "role", status: "fulfilled" }), []);
  });
  it("bundle blocks unknown BOM; certified BOM separates Deck and Box", () => {
    const raw = { phone: "0812345678", status: "paid", bundleId: "b1", bundleName: "Starter" };
    assert.ok(adaptOrder("bundle-orders", "o1", raw)[0].blockers.length);
    const lines = adaptOrder("bundle-orders", "o1", raw, { b1: [{ id: "deck", name: "Deck", quantity: 1, unit: "ชุด" }, { id: "box", name: "Box", quantity: 2, unit: "บ็อกซ์" }] });
    assert.equal(lines.length, 2); assert.equal(lines[1].entitlement, 2);
  });
  it("MA6 key survives row movement; collision blocks; L13 cancelled product cannot deliver", () => {
    const row = ["timestamp", "Example", "", "0812345678", "3", "", "", "", "", "ชำระครบ"];
    const a = adaptSheet("ma6-sheet", "s", "t", [[], row]);
    const b = adaptSheet("ma6-sheet", "s", "t", [[], [], row]);
    assert.equal(a[0].key, b[0].key);
    assert.ok(adaptSheet("ma6-sheet", "s", "t", [[], row, row])[0].blockers.includes("identity ของแถวชนกัน ต้องตรวจสอบ"));
    const l13 = adaptSheet("lorcana13-sheet", "s", "t", [[], ["ts", "Name", "0812345678", "", "", "0", "0", "0", "0", "1"]]);
    assert.ok(l13[0].blockers.some(b => b.includes("ถูกยกเลิก")));
  });
});
describe("append-only movement invariants", () => {
  it("partial handover and replacement returns replay to correct remaining balance", () => {
    const once = applyMovement(base, "handover", 1);
    assert.equal(remaining(once), 2); assert.equal(remaining(applyMovement(once, "handover", 2)), 0);
    assert.equal(remaining(applyMovement(once, "return", 1)), 3);
    assert.equal(base.delivered, 0);
  });
  it("close returns atomically close the entitlement without opening it again", () => {
    const next = applyMovement(applyMovement(base, "handover", 1), "return", 1, "close");
    assert.equal(remaining(next), 2); assert.equal(next.cancelled, 1);
  });
  it("over-delivery, negative, fractional, over-return and over-cancel are rejected", () => {
    for (const qty of [4, -1, 0, 1.5]) assert.throws(() => applyMovement(base, "handover", qty));
    assert.throws(() => applyMovement(base, "return", 1));
    assert.throws(() => applyMovement(base, "cancel_entitlement", 4));
  });
  it("reverse handover and cancel without erasing originals; reversal cycles prohibited", () => {
    assert.deepEqual(applyMovement(applyMovement(base, "handover", 1), "reversal", 1, "replace", "handover"), base);
    assert.deepEqual(applyMovement(applyMovement(base, "cancel_entitlement", 1), "reversal", 1, "replace", "cancel_entitlement"), base);
    assert.throws(() => applyMovement(base, "reversal", 1, "replace", "reversal"));
  });
  it("unapproved opening, stale source, unpaid, shipped and unavailable BOM never deliver", () => {
    const line = adaptOrder("set14-orders", "1", { phone: "0812345678", status: "paid", items: [{ productId: "box" }] })[0];
    const b = { ...base, fingerprint: line.fingerprint };
    assert.equal(canDeliver(line, b), true);
    assert.equal(canDeliver(line), false);
    assert.equal(canDeliver(line, { ...b, approved: false }), false);
    assert.equal(canDeliver(line, base), false);
    assert.equal(canDeliver({ ...line, paid: false }, b), false);
    assert.equal(canDeliver({ ...line, shipped: true }, b), false);
    assert.throws(() => applyMovement({ ...b, approved: false }, "handover", 1));
    assert.notEqual(hash({ qty: 1 }), hash({ qty: 2 }));
  });
});
describe("explicit handover permissions", () => {
  const grant = grantFor("staff@example.com", { "staff@example.com": { permissions: ["read", "record"], branches: ["bangkae"] } });
  const context = { realSession: true, credentials: true, impersonating: false, branch: "bangkae" };
  it("no default staff grant, no role-based owner escalation", () => assert.deepEqual(grantFor("admin@example.com", {}), { permissions: [], branches: [] }));
  it("preview, impersonation, missing credentials, wrong branch, corrections rejected", () => {
    assert.equal(authorized("record", grant, context), true);
    for (const patch of [{ realSession: false }, { credentials: false }, { impersonating: true }, { branch: "senafest" }]) assert.equal(authorized("record", grant, { ...context, ...patch }), false);
    assert.equal(authorized("correct", grant, context), false);
  });
});
