import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deductionCategoryLabel,
  deductionSourceLabel,
  resolveStaffViewSelection
} from "../lib/staff-view.ts";

const validCodes = ["ICE", "Boom", "Leo"];

describe("resolveStaffViewSelection", () => {
  it("staff sees only their own code and cannot switch", () => {
    const result = resolveStaffViewSelection({ isOwner: false, selfCode: "Boom", requestedCode: "ICE", validCodes });
    assert.equal(result.selectedCode, "Boom");
    assert.equal(result.canSwitch, false);
  });

  it("staff whose email is not in the directory gets no selection (empty state)", () => {
    const result = resolveStaffViewSelection({ isOwner: false, selfCode: null, validCodes });
    assert.equal(result.selectedCode, null);
    assert.equal(result.canSwitch, false);
  });

  it("staff cannot force another code through the query string", () => {
    const result = resolveStaffViewSelection({ isOwner: false, selfCode: null, requestedCode: "ICE", validCodes });
    assert.equal(result.selectedCode, null);
  });

  it("owner defaults to self-view when their email maps to a staff code", () => {
    const result = resolveStaffViewSelection({ isOwner: true, selfCode: "ICE", validCodes });
    assert.equal(result.selectedCode, "ICE");
    assert.equal(result.canSwitch, true);
  });

  it("owner may switch to any valid staff via the requested code", () => {
    const result = resolveStaffViewSelection({ isOwner: true, selfCode: "ICE", requestedCode: "Leo", validCodes });
    assert.equal(result.selectedCode, "Leo");
  });

  it("owner falls back to the first staff when not rostered and no code requested", () => {
    const result = resolveStaffViewSelection({ isOwner: true, selfCode: null, validCodes });
    assert.equal(result.selectedCode, "ICE");
    assert.equal(result.canSwitch, true);
  });

  it("owner ignores an invalid requested code and falls back to self", () => {
    const result = resolveStaffViewSelection({ isOwner: true, selfCode: "Boom", requestedCode: "ghost", validCodes });
    assert.equal(result.selectedCode, "Boom");
  });

  it("returns null when there are no valid codes at all", () => {
    const result = resolveStaffViewSelection({ isOwner: true, selfCode: null, validCodes: [] });
    assert.equal(result.selectedCode, null);
  });
});

describe("deduction labels", () => {
  it("maps categories to Thai", () => {
    assert.equal(deductionCategoryLabel("attendance"), "เข้างาน");
    assert.equal(deductionCategoryLabel("customer_service"), "บริการลูกค้า");
  });

  it("maps known sources to Thai and passes through unknown ones", () => {
    assert.equal(deductionSourceLabel("google-sheet"), "ตารางกะ");
    assert.equal(deductionSourceLabel("storehub"), "StoreHub");
    assert.equal(deductionSourceLabel("weird"), "weird");
  });
});
