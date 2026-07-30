import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPhaseInShift, phasesForShift, cardStoreWorkflow } from "../lib/card-store-workflow.ts";

describe("isPhaseInShift", () => {
  it("opening (เปิดร้าน) belongs to s1 only", () => {
    assert.equal(isPhaseInShift("open-store", "s1"), true);
    assert.equal(isPhaseInShift("open-store", "s2"), false);
  });

  it("closing (ปิดร้าน) belongs to s2 only", () => {
    assert.equal(isPhaseInShift("close-store", "s2"), true);
    assert.equal(isPhaseInShift("close-store", "s1"), false);
  });

  it("shared phases belong to both shifts", () => {
    for (const id of ["guild-chat-exp", "daytime-work", "stock-work"]) {
      assert.equal(isPhaseInShift(id, "s1"), true);
      assert.equal(isPhaseInShift(id, "s2"), true);
    }
  });

  it("unknown phaseId is never flagged as off-shift", () => {
    assert.equal(isPhaseInShift("does-not-exist", "s1"), true);
    assert.equal(isPhaseInShift("does-not-exist", "s2"), true);
  });

  it("agrees with phasesForShift for every real phase", () => {
    for (const shift of ["s1", "s2"] as const) {
      const visible = new Set(phasesForShift(cardStoreWorkflow, shift).map((p) => p.id));
      for (const phase of cardStoreWorkflow) {
        assert.equal(isPhaseInShift(phase.id, shift), visible.has(phase.id));
      }
    }
  });
});
