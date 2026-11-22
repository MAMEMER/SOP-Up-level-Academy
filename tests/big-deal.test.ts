import { test } from "node:test";
import { strict as assert } from "node:assert";
import { calculateBigDeal, canTransition, DEFAULT_BIG_DEAL_CONFIG, validateShares } from "../lib/big-deal.ts";
import type { MistakeRecord } from "../lib/mistake-log.ts";

const one = [{ staffCode: "UP-001", percent: 100 }];
test("threshold, rate and cap", () => {
  assert.equal(calculateBigDeal(9999, DEFAULT_BIG_DEAL_CONFIG, one, "2026-11", []).bonus, 0);
  assert.equal(calculateBigDeal(10000, DEFAULT_BIG_DEAL_CONFIG, one, "2026-11", []).bonus, 300);
  assert.equal(calculateBigDeal(200000, DEFAULT_BIG_DEAL_CONFIG, one, "2026-11", []).bonus, 3000);
});
test("shares allocate whole baht and exclude intentional mistakes without redistributing", () => {
  const shares = [{ staffCode: "UP-001", percent: 50 }, { staffCode: "UP-002", percent: 50 }];
  const mistake = { staffCode: "UP-001", date: "2026-11-01", level: "intentional" } as MistakeRecord;
  const result = calculateBigDeal(10034, DEFAULT_BIG_DEAL_CONFIG, shares, "2026-11", [mistake]);
  assert.equal(result.bonus, 301);
  assert.deepEqual(result.shares.map((s) => s.amount), [0, 150]);
  assert.equal(calculateBigDeal(10034, DEFAULT_BIG_DEAL_CONFIG, shares, "2026-11", [{ ...mistake, decision: { result: "voided", by: "a", at: "now" } }]).shares[0].amount, 151);
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
