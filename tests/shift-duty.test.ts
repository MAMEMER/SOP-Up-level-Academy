import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { effectiveShift, effectiveShiftMap } from "../lib/shift-duty.ts";

describe("effectiveShift", () => {
  it("earliest starter opens even when labelled ก2 (บางแค 2026-11-18: Boom 11:30 + Non 13:00)", () => {
    const day = [
      { staffCode: "UP-001", assignment: "off" },
      { staffCode: "UP-003", assignment: "s2", startTime: "11:30" },
      { staffCode: "UP-007", assignment: "s2", startTime: "13:00" }
    ];
    assert.equal(effectiveShift(day, "UP-003"), "s1");
    assert.equal(effectiveShift(day, "UP-007"), "s2");
    assert.equal(effectiveShift(day, "UP-001"), null);
  });

  it("latest starter closes even when labelled ก1", () => {
    const day = [
      { staffCode: "A", assignment: "s1", startTime: "09:00" },
      { staffCode: "B", assignment: "s1", startTime: "11:00" }
    ];
    assert.equal(effectiveShift(day, "A"), "s1");
    assert.equal(effectiveShift(day, "B"), "s2");
  });

  it("keeps the label for a middle starter and for a lone worker", () => {
    const day = [
      { staffCode: "A", assignment: "s1", startTime: "09:00" },
      { staffCode: "B", assignment: "s1", startTime: "11:00" },
      { staffCode: "C", assignment: "s2", startTime: "13:00" }
    ];
    assert.equal(effectiveShift(day, "B"), "s1");
    assert.equal(effectiveShift([{ staffCode: "A", assignment: "s2", startTime: "11:30" }], "A"), "s2");
  });

  it("normal day is unchanged (เสนาฯ ก1 09:30 + ก2 13:00)", () => {
    const map = effectiveShiftMap([
      { staffCode: "UP-006", assignment: "s1", startTime: "09:30" },
      { staffCode: "UP-008", assignment: "s2", startTime: "13:00" },
      { staffCode: "UP-002", assignment: "off" }
    ]);
    assert.deepEqual([...map.entries()], [["UP-006", "s1"], ["UP-008", "s2"]]);
  });

  it("missing start time falls back to the label's end of the day", () => {
    const day = [
      { staffCode: "A", assignment: "s1" },
      { staffCode: "B", assignment: "s2" }
    ];
    assert.equal(effectiveShift(day, "A"), "s1");
    assert.equal(effectiveShift(day, "B"), "s2");
  });
});
