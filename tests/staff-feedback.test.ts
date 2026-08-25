import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allForAdmin,
  pendingReviewCount,
  stripSender,
  tally,
  visibleForStaff,
  type StaffFeedback
} from "../lib/staff-feedback.ts";

function feedback(over: Partial<StaffFeedback> & Pick<StaffFeedback, "id" | "staffCode" | "kind" | "createdAt">): StaffFeedback {
  return {
    staffName: "Boom",
    message: "ช่วยหาการ์ดให้จนเจอ",
    memberUid: "uid-1",
    memberName: "Master Championest",
    visibleToStaff: over.kind === "praise",
    ...over
  };
}

const rows: StaffFeedback[] = [
  feedback({ id: "a", staffCode: "UP-003", kind: "praise", createdAt: "2026-08-20T03:00:00.000Z" }),
  feedback({ id: "b", staffCode: "UP-003", kind: "complaint", createdAt: "2026-08-21T03:00:00.000Z" }),
  feedback({ id: "c", staffCode: "UP-003", kind: "complaint", createdAt: "2026-08-22T03:00:00.000Z", visibleToStaff: true }),
  feedback({ id: "d", staffCode: "UP-003", kind: "suggestion", createdAt: "2026-08-23T03:00:00.000Z", hidden: true, visibleToStaff: true }),
  feedback({ id: "e", staffCode: "UP-005", kind: "praise", createdAt: "2026-08-24T03:00:00.000Z" })
];

describe("สิ่งที่พนักงานเห็น", () => {
  it("เห็นเฉพาะของตัวเอง ที่เปิดให้เห็นแล้ว และไม่ถูกซ่อน — ใหม่สุดก่อน", () => {
    assert.deepEqual(visibleForStaff(rows, "UP-003").map((item) => item.id), ["c", "a"]);
    assert.deepEqual(visibleForStaff(rows, "UP-005").map((item) => item.id), ["e"]);
  });

  it("ชื่อผู้ส่งถูกตัดทิ้งเสมอก่อนถึงพนักงาน", () => {
    for (const item of visibleForStaff(rows, "UP-003")) {
      assert.equal("memberName" in item, false);
      assert.equal("memberUid" in item, false);
      assert.equal("reviewedBy" in item, false);
    }
    const stripped = stripSender(rows[0]);
    assert.equal(JSON.stringify(stripped).includes("Master Championest"), false);
  });

  it("คำติที่ยังไม่ถูกเปิด พนักงานยังไม่เห็น", () => {
    assert.equal(visibleForStaff(rows, "UP-003").some((item) => item.id === "b"), false);
  });
});

describe("มุมมองหัวหน้า", () => {
  it("เห็นทั้งหมดของคนนั้น รวมที่ยังไม่ส่งต่อและที่ซ่อนแล้ว", () => {
    assert.deepEqual(allForAdmin(rows, "UP-003").map((item) => item.id), ["d", "c", "b", "a"]);
  });

  it("นับเฉพาะที่ยังไม่ตัดสินใจ (ยังไม่เปิด และยังไม่ซ่อน)", () => {
    assert.equal(pendingReviewCount(allForAdmin(rows, "UP-003")), 1);
  });

  it("สรุปจำนวนแยกชนิดได้", () => {
    assert.deepEqual(tally(allForAdmin(rows, "UP-003")), { praise: 1, suggestion: 1, complaint: 2 });
  });
});
