import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canEditSop, canReadSop, canSubmitForApproval } from "../lib/permissions.ts";

const frontStore = "front_store";
const stock = "stock";

describe("SOP permissions", () => {
  it("lets employees read only published SOPs", () => {
    assert.equal(canReadSop({ role: "employee", departmentId: frontStore }, { status: "published", departmentId: stock }), true);
    assert.equal(canReadSop({ role: "employee", departmentId: frontStore }, { status: "draft", departmentId: frontStore }), false);
  });

  it("lets leaders edit only their department drafts and revisions", () => {
    assert.equal(canEditSop({ role: "leader", departmentId: frontStore }, { status: "draft", departmentId: frontStore }), true);
    assert.equal(canEditSop({ role: "leader", departmentId: frontStore }, { status: "needs_revision", departmentId: frontStore }), true);
    assert.equal(canEditSop({ role: "leader", departmentId: frontStore }, { status: "draft", departmentId: stock }), false);
    assert.equal(canEditSop({ role: "leader", departmentId: frontStore }, { status: "published", departmentId: frontStore }), false);
  });

  it("lets admins edit everything", () => {
    assert.equal(canEditSop({ role: "admin", departmentId: null }, { status: "published", departmentId: stock }), true);
  });

  it("lets leaders submit only their department drafts or revisions", () => {
    assert.equal(canSubmitForApproval({ role: "leader", departmentId: frontStore }, { status: "draft", departmentId: frontStore }), true);
    assert.equal(canSubmitForApproval({ role: "leader", departmentId: frontStore }, { status: "needs_revision", departmentId: frontStore }), true);
    assert.equal(canSubmitForApproval({ role: "leader", departmentId: frontStore }, { status: "draft", departmentId: stock }), false);
  });
});
