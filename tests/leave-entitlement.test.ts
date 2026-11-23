import { test } from "node:test";
import { strict as assert } from "node:assert";
import { DEFAULT_LEAVE_POLICY as defaults, entitlement, remaining, usedLeave } from "../lib/leave-entitlement.ts";
test("default allowances and position overrides", () => {
  assert.deepEqual(entitlement(defaults, "regular", "2025-01-01", "2026-01-01"), { sick: 30, personal: 3, vacation: 6 });
  const policy = structuredClone(defaults); policy.byPosition.temporary.sick = 10;
  assert.equal(entitlement(policy, "temporary", "2025-01-01", "2026-01-01").sick, 10);
});
test("vacation requires full service and a start date", () => {
  assert.equal(entitlement(defaults, "regular", "2025-05-10", "2026-05-09").vacation, 0);
  assert.equal(entitlement(defaults, "regular", "2025-05-10", "2026-05-10").vacation, 6);
  assert.equal(entitlement(defaults, "regular", undefined, "2026-12-31").vacation, 0);
});
test("distinct dates, actual overrides planned, calendar year, and negative balance", () => {
  const shifts = [{staffCode:"A",workDate:"2026-01-01",assignment:"leave_sick"},{staffCode:"A",workDate:"2026-01-01",assignment:"leave_sick"},{staffCode:"A",workDate:"2025-12-31",assignment:"leave_sick"}];
  const actuals = [{staffCode:"A",workDate:"2026-01-01",leaveType:"personal"},{staffCode:"A",workDate:"2026-01-01",leaveType:"personal"}];
  const used = usedLeave("A", 2026, shifts, actuals);
  assert.deepEqual(used, {sick:0,personal:1,vacation:0});
  assert.equal(remaining({sick:0, personal:0, vacation:0}, used).personal, -1);
});
