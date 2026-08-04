import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupAssignmentsByTask } from "../lib/assigned-work-teams.ts";
import type { WorkAssignment } from "../lib/work-assignments-store.ts";

function assignment(overrides: Partial<WorkAssignment> & { id: string; staffCode: string }): WorkAssignment {
  return {
    branch: "bangkae",
    workDate: "2026-08-04",
    title: "งานตัวอย่าง",
    status: "open",
    assignedBy: "owner@shop",
    createdAt: "2026-08-04T09:00:00.000Z",
    ...overrides
  };
}

describe("groupAssignmentsByTask", () => {
  it("keeps a lone assignment as an individual task", () => {
    const groups = groupAssignmentsByTask([assignment({ id: "wa__1", staffCode: "ICE", title: "ส่งของ" })]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].type, "individual");
    assert.equal(groups[0].memberCount, 1);
    assert.equal(groups[0].members[0].staffCode, "ICE");
  });

  it("folds rows sharing createdAt + title into one team task with all members", () => {
    const groups = groupAssignmentsByTask([
      assignment({ id: "wa__a", staffCode: "ICE", title: "จัดบูธ", createdAt: "t1" }),
      assignment({ id: "wa__b", staffCode: "NON", title: "จัดบูธ", createdAt: "t1" })
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].type, "team");
    assert.equal(groups[0].memberCount, 2);
    const codes = groups[0].members.map((m) => m.staffCode).sort();
    assert.deepEqual(codes, ["ICE", "NON"]);
  });

  it("does NOT merge same-title tasks assigned at different times", () => {
    const groups = groupAssignmentsByTask([
      assignment({ id: "wa__a", staffCode: "ICE", title: "จัดบูธ", createdAt: "t1" }),
      assignment({ id: "wa__b", staffCode: "NON", title: "จัดบูธ", createdAt: "t2" })
    ]);
    assert.equal(groups.length, 2);
    assert.ok(groups.every((g) => g.type === "individual"));
  });

  it("exposes submission fields (submittedAt / submittedBy / note) on a submitted member", () => {
    const groups = groupAssignmentsByTask([
      assignment({
        id: "wa__s",
        staffCode: "ICE",
        status: "submitted",
        submittedAt: "2026-08-04T12:30:00.000Z",
        note: "ส่งเรียบร้อย",
        imageEvidence: ["https://x/y.jpg"]
      })
    ]);
    const member = groups[0].members[0];
    assert.equal(member.status, "submitted");
    assert.equal(member.submittedAt, "2026-08-04T12:30:00.000Z");
    assert.ok(member.submittedBy && member.submittedBy.length > 0);
    assert.equal(member.note, "ส่งเรียบร้อย");
    assert.deepEqual(member.imageEvidence, ["https://x/y.jpg"]);
  });

  it("orders groups by due time, undated last", () => {
    const groups = groupAssignmentsByTask([
      assignment({ id: "wa__late", staffCode: "ICE", title: "บ่าย", dueTime: "16:00", createdAt: "t1" }),
      assignment({ id: "wa__none", staffCode: "NON", title: "ไม่มีเวลา", createdAt: "t2" }),
      assignment({ id: "wa__early", staffCode: "AOF", title: "เช้า", dueTime: "09:30", createdAt: "t3" })
    ]);
    assert.deepEqual(
      groups.map((g) => g.title),
      ["เช้า", "บ่าย", "ไม่มีเวลา"]
    );
  });
});
