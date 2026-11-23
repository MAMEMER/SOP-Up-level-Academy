import { test } from "node:test";
import { strict as assert } from "node:assert";
import { earliestAllowedDate, validateRequest } from "../lib/leave-requests.ts";

test("calendar month notice clamps month ends including leap years", () => {
  assert.equal(earliestAllowedDate("2025-01-31"), "2025-02-28");
  assert.equal(earliestAllowedDate("2024-01-31"), "2024-02-29");
  assert.equal(earliestAllowedDate("2026-12-31"), "2027-01-31");
  assert.equal(earliestAllowedDate("invalid"), null);
});
test("validates notice, entitlement, balance and duplicate dates", () => {
  const today = "2026-01-31";
  assert.equal(validateRequest(["2026-01-30"], today, 2), "past");
  assert.equal(validateRequest(["2026-02-27"], today, 2), "too_soon");
  assert.equal(validateRequest(["2026-02-28", "2026-02-28"], today, 2), "duplicate");
  assert.equal(validateRequest(["2026-02-28"], today, 0), "not_entitled");
  assert.equal(validateRequest(["2026-02-28", "2026-03-01"], today, 1), "over_limit");
  assert.equal(validateRequest(["2026-02-28"], today, 1), null);
  assert.equal(validateRequest(["2026-02-30"], today, 1), "past");
});
