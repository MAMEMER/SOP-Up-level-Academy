import { test } from "node:test";
import { strict as assert } from "node:assert";
import { calculateBigDeal, canTransition, validateShares } from "../lib/big-deal.ts";
import type { MistakeRecord } from "../lib/mistake-log.ts";

const config = { minTotal: 100, ratePct: 10, capPerDeal: 50 };
const one = [{ staffCode: "UP-001", percent: 100 }];
test("threshold, rate and cap", () => {
  assert.equal(calculateBigDeal(99, config, one, "2026-11", []).bonus, 0);
  assert.equal(calculateBigDeal(100, config, one, "2026-11", []).bonus, 10);
  assert.equal(calculateBigDeal(1000, config, one, "2026-11", []).bonus, 50);
});
test("shares allocate whole baht and exclude intentional mistakes without redistributing", () => {
  const shares = [{ staffCode: "UP-001", percent: 50 }, { staffCode: "UP-002", percent: 50 }];
  const mistake = { staffCode: "UP-001", date: "2026-11-01", level: "intentional" } as MistakeRecord;
  const result = calculateBigDeal(105, config, shares, "2026-11", [mistake]);
  assert.equal(result.bonus, 11);
  assert.deepEqual(result.shares.map((s) => s.amount), [0, 5]);
  assert.equal(calculateBigDeal(105, config, shares, "2026-11", [{ ...mistake, decision: { result: "voided", by: "a", at: "now" } }]).shares[0].amount, 6);
});
test("invalid shares and status transitions are rejected", () => {
  assert.equal(validateShares([{ staffCode: "a", percent: 99 }]), false);
  assert.equal(validateShares([{ staffCode: "a", percent: 50 }, { staffCode: "A", percent: 50 }]), false);
  assert.equal(canTransition("logged", "approved"), false);
  assert.equal(canTransition("logged", "manager_checked"), true);
  assert.equal(canTransition("approved", "paid"), true);
  assert.equal(canTransition("paid", "rejected", "reason"), false);
  assert.equal(canTransition("logged", "rejected"), false);
});
