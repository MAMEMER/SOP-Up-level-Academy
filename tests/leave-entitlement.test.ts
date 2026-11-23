import { test } from "node:test";
import { strict as assert } from "node:assert";
import { DEFAULT_LEAVE_POLICY as defaults, entitlement, remaining, usedLeave } from "../lib/leave-entitlement.ts";
test("default allowances and position overrides", () => {
  assert.deepEqual(entitlement(defaults, "regular", "2025-01-01", "2026-01-01"), { sick: 30, personal: 3, vacation: 13 });
  const policy = structuredClone(defaults); policy.byPosition.temporary.sick = 10;
  assert.equal(entitlement(policy, "temporary", "2025-01-01", "2026-01-01").sick, 10);
});
test("vacation does not require a waiting period and temporary staff have no default entitlement", () => {
  assert.equal(entitlement(defaults, "regular", undefined, "2026-01-01").vacation, 13);
  assert.equal(entitlement(defaults, "temporary", undefined, "2026-01-01").vacation, 0);
  assert.equal(entitlement(defaults, "branch_manager", undefined, "2026-01-01").vacation, 13);
});
test("distinct dates, actual overrides planned, calendar year, and negative balance", () => {
  const shifts = [{staffCode:"A",workDate:"2026-01-01",assignment:"leave_sick"},{staffCode:"A",workDate:"2026-01-01",assignment:"leave_sick"},{staffCode:"A",workDate:"2025-12-31",assignment:"leave_sick"}];
  const actuals = [{staffCode:"A",workDate:"2026-01-01",leaveType:"personal"},{staffCode:"A",workDate:"2026-01-01",leaveType:"personal"}];
  const used = usedLeave("A", 2026, shifts, actuals);
  assert.deepEqual(used, {sick:0,personal:1,vacation:0});
  assert.equal(remaining({sick:0, personal:0, vacation:0}, used).personal, -1);
});

test("one calendar month notice clamps month end", async () => {
  const { vacationRequestMinimumDate } = await import("../lib/leave-entitlement.ts");
  assert.equal(vacationRequestMinimumDate("2025-01-31"), "2025-02-28");
  assert.equal(vacationRequestMinimumDate("2024-01-31"), "2024-02-29");
});
test("pending vacation reserves distinct dates in the requested year", async () => {
  const { pendingVacationDays } = await import("../lib/leave-entitlement.ts");
  assert.equal(pendingVacationDays(2026, [{status:"pending",dates:["2026-03-01","2026-03-01","2027-01-01"]},{status:"rejected",dates:["2026-04-01"]}]), 1);
});
