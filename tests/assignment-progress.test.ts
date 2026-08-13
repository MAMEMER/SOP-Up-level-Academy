import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_ASSIGNMENT_PROGRESS, latestProgress } from "../lib/work-assignments-store.ts";
import type { AssignmentProgress, WorkAssignment } from "../lib/work-assignments-store.ts";

function entry(id: string, note: string, images?: string[]): AssignmentProgress {
  return { id, at: `2026-08-13T0${id}:00:00Z`, by: "ICE", note, ...(images ? { images } : {}) };
}

function assignment(progress?: AssignmentProgress[]): WorkAssignment {
  return {
    id: "wa__1",
    branch: "bangkae",
    workDate: "2026-08-13",
    staffCode: "ICE",
    title: "จัดของขึ้นชั้น",
    status: "open",
    assignedBy: "owner@shop",
    createdAt: "2026-08-13T00:00:00Z",
    ...(progress ? { progress } : {})
  };
}

describe("ความคืบหน้าของงานที่มอบหมาย", () => {
  it("ยังไม่เคยอัปเดต = ไม่มีอัปเดตล่าสุด", () => {
    assert.equal(latestProgress(assignment()), null);
    assert.equal(latestProgress(assignment([])), null);
  });

  it("อัปเดตล่าสุดคือรายการท้ายสุด (เก็บเรียงเก่า→ใหม่)", () => {
    const last = latestProgress(assignment([entry("1", "แพ็กไป 10 กล่อง"), entry("2", "แพ็กครบ 50 กล่อง")]));
    assert.equal(last?.note, "แพ็กครบ 50 กล่อง");
  });

  it("รูปแนบได้แต่ไม่บังคับ — อัปเดตที่ไม่มีรูปก็ยังนับ", () => {
    const withPhoto = latestProgress(assignment([entry("1", "ยกของเสร็จ", ["https://x/a.jpg"])]));
    assert.deepEqual(withPhoto?.images, ["https://x/a.jpg"]);
    const withoutPhoto = latestProgress(assignment([entry("1", "ยกของเสร็จ")]));
    assert.equal(withoutPhoto?.images, undefined);
  });

  it("เพดานจำนวนอัปเดตต้องเท่ากับที่ route ตัดทิ้ง (กันเอกสารชน 1MiB)", () => {
    // route ตัดด้วย .slice(-MAX_ASSIGNMENT_PROGRESS) — ค่าสองฝั่งต้องตรงกัน
    assert.equal(MAX_ASSIGNMENT_PROGRESS, 50);
    const many = Array.from({ length: 60 }, (_, i) => entry(String(i), `ครั้งที่ ${i}`));
    const kept = many.slice(-MAX_ASSIGNMENT_PROGRESS);
    assert.equal(kept.length, 50);
    assert.equal(latestProgress(assignment(kept))?.note, "ครั้งที่ 59");
  });
});
