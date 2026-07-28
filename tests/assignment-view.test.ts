import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assignmentStatusLabel, groupAssignments, isAssignmentActionable } from "../lib/assignment-view.ts";
import type { WorkAssignment } from "../lib/work-assignments-store.ts";

function make(partial: Partial<WorkAssignment> & { id: string; status: WorkAssignment["status"]; workDate: string }): WorkAssignment {
  return {
    branch: "bangkae",
    staffCode: "ICE",
    title: "งาน " + partial.id,
    assignedBy: "owner@shop",
    createdAt: "2026-07-27T00:00:00Z",
    ...partial
  };
}

const TODAY = "2026-07-28";

describe("groupAssignments", () => {
  const items: WorkAssignment[] = [
    make({ id: "a", status: "open", workDate: TODAY }), // today
    make({ id: "b", status: "open", workDate: "2026-07-26" }), // overdue
    make({ id: "c", status: "submitted", workDate: "2026-07-25" }), // submitted
    make({ id: "d", status: "done", workDate: "2026-07-24" }), // submitted (done)
    make({ id: "e", status: "needs_revision", workDate: "2026-07-20" }), // revision (even though old)
    make({ id: "f", status: "open", workDate: "2026-07-30" }) // upcoming -> today bucket
  ];

  it("splits into the four staff-facing buckets by status then date", () => {
    const g = groupAssignments(items, TODAY);
    assert.deepEqual(g.today.map((i) => i.id), ["a", "f"]);
    assert.deepEqual(g.overdue.map((i) => i.id), ["b"]);
    assert.deepEqual(g.submitted.map((i) => i.id).sort(), ["c", "d"]);
    assert.deepEqual(g.revision.map((i) => i.id), ["e"]);
  });

  it("keeps a needs_revision task in the revision bucket regardless of its due date", () => {
    const g = groupAssignments([make({ id: "x", status: "needs_revision", workDate: "2026-01-01" })], TODAY);
    assert.equal(g.revision.length, 1);
    assert.equal(g.overdue.length, 0);
  });
});

describe("assignment status helpers", () => {
  it("labels every status", () => {
    assert.equal(assignmentStatusLabel.open, "ยังไม่ส่ง");
    assert.equal(assignmentStatusLabel.needs_revision, "ต้องแก้ไข");
    assert.equal(assignmentStatusLabel.done, "รับงานแล้ว");
  });

  it("only open/needs_revision work is actionable by staff", () => {
    assert.equal(isAssignmentActionable("open"), true);
    assert.equal(isAssignmentActionable("needs_revision"), true);
    assert.equal(isAssignmentActionable("submitted"), false);
    assert.equal(isAssignmentActionable("done"), false);
  });
});
