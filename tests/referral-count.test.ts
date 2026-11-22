import { test } from "node:test";
import assert from "node:assert/strict";
import { bangkokMonthRange, countActiveReferrals } from "../lib/referral-count.ts";

test("Bangkok calendar boundaries and paid active referrals", () => {
  const now = new Date("2026-12-01T00:00:00+07:00");
  const { start, end } = bangkokMonthRange(now);
  assert.equal(new Date(start).toISOString(), "2026-11-30T17:00:00.000Z");
  assert.equal(new Date(end).toISOString(), "2026-12-31T17:00:00.000Z");
  const base = { tier: "member", status: "active", createdAt: new Date(start) };
  assert.equal(countActiveReferrals([base, { ...base, createdAt: new Date(end) }, { ...base, createdAt: new Date(start - 1) }, { ...base, tier: "" }, { ...base, status: "inactive" }, { ...base, membershipRevoked: true }, { ...base, createdAt: { toDate: () => new Date(end - 1) } }], now), 2);
});
