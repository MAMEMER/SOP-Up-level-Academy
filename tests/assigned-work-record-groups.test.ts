import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  groupAssignedWorkRecords,
  type AssignedWorkRecord
} from "../lib/performance-service-records.ts";

function record(overrides: Partial<AssignedWorkRecord>): AssignedWorkRecord {
  return {
    id: "assigned-1",
    workDate: "2026-07-27",
    employeeName: "ICE",
    title: "จัดชั้นการ์ด",
    status: "on_time",
    note: "",
    recordedAt: "2026-07-27T03:00:00.000Z",
    ...overrides
  };
}

describe("groupAssignedWorkRecords (fold multi-assign KPI records into one task)", () => {
  it("folds records sharing a groupId into one team group, sorted by name", () => {
    const groups = groupAssignedWorkRecords([
      record({ id: "r-ice", employeeName: "ICE", groupId: "agrp-x", assigneeCount: 2 }),
      record({ id: "r-boom", employeeName: "Boom", groupId: "agrp-x", assigneeCount: 2 })
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].isTeam, true);
    assert.equal(groups[0].members.length, 2);
    assert.deepEqual(groups[0].members.map((m) => m.employeeName), ["Boom", "ICE"]);
    // links to the first member's record
    assert.equal(groups[0].primaryId, "r-boom");
  });

  it("keeps records without a groupId individual, even with the same title", () => {
    const groups = groupAssignedWorkRecords([
      record({ id: "r1", employeeName: "ICE" }),
      record({ id: "r2", employeeName: "Boom" })
    ]);
    assert.equal(groups.length, 2);
    assert.equal(groups.every((g) => g.isTeam === false), true);
  });

  it("preserves first-seen order across groups", () => {
    const groups = groupAssignedWorkRecords([
      record({ id: "solo", employeeName: "Leo", title: "ส่งพัสดุ" }),
      record({ id: "t-ice", employeeName: "ICE", groupId: "agrp-y" }),
      record({ id: "t-boom", employeeName: "Boom", groupId: "agrp-y" })
    ]);
    assert.deepEqual(groups.map((g) => g.title), ["ส่งพัสดุ", "จัดชั้นการ์ด"]);
  });
});
