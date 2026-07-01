import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canTransitionSopStatus } from "../lib/sop-status.ts";

describe("SOP status transitions", () => {
  it("allows leaders to submit drafts and revisions", () => {
    assert.equal(canTransitionSopStatus("leader", "draft", "pending_approval"), true);
    assert.equal(canTransitionSopStatus("leader", "needs_revision", "pending_approval"), true);
  });

  it("blocks leaders from publishing", () => {
    assert.equal(canTransitionSopStatus("leader", "pending_approval", "published"), false);
  });

  it("allows admins to publish or return pending SOPs", () => {
    assert.equal(canTransitionSopStatus("admin", "pending_approval", "published"), true);
    assert.equal(canTransitionSopStatus("admin", "pending_approval", "needs_revision"), true);
  });

  it("blocks employees from changing statuses", () => {
    assert.equal(canTransitionSopStatus("employee", "draft", "pending_approval"), false);
  });
});
