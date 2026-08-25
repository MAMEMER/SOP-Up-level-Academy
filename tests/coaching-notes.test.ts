import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_NOTE_IMAGES,
  MAX_NOTE_LENGTH,
  noteDateLabel,
  notesForStaff,
  unacknowledgedCount,
  validateNoteDraft,
  type CoachingNote
} from "../lib/coaching-notes.ts";

function note(over: Partial<CoachingNote> & Pick<CoachingNote, "id" | "staffCode" | "createdAt">): CoachingNote {
  return {
    branch: "bangkae",
    period: "2026-08",
    note: "ลองกดส่งทีละหัวข้อ",
    createdBy: "owner@x.com",
    ...over
  };
}

describe("ตรวจก่อนส่งคำแนะนำ", () => {
  it("ต้องเลือกคนและต้องมีข้อความ", () => {
    assert.equal(validateNoteDraft({ note: "ทำดีมาก" }), "ต้องเลือกพนักงานที่จะส่งคำแนะนำให้");
    assert.equal(validateNoteDraft({ staffCode: "ICE", note: "   " }), "เขียนคำแนะนำก่อนส่ง");
    assert.equal(validateNoteDraft({ staffCode: "ICE", note: "ส่ง checklist ให้ตรงเวลา" }), null);
  });

  it("จำกัดความยาวข้อความและจำนวนรูป", () => {
    assert.match(validateNoteDraft({ staffCode: "ICE", note: "ก".repeat(MAX_NOTE_LENGTH + 1) }) ?? "", /ยาวเกินไป/);
    assert.equal(validateNoteDraft({ staffCode: "ICE", note: "ok", images: new Array(MAX_NOTE_IMAGES).fill("https://x/1.jpg") }), null);
    assert.match(
      validateNoteDraft({ staffCode: "ICE", note: "ok", images: new Array(MAX_NOTE_IMAGES + 1).fill("https://x/1.jpg") }) ?? "",
      /สูงสุด/
    );
  });
});

describe("รายการคำแนะนำ", () => {
  const notes = [
    note({ id: "a", staffCode: "ICE", createdAt: "2026-08-10T03:00:00.000Z" }),
    note({ id: "b", staffCode: "ICE", createdAt: "2026-08-20T03:00:00.000Z", acknowledgedAt: "2026-08-20T05:00:00.000Z" }),
    note({ id: "c", staffCode: "Boom", createdAt: "2026-08-21T03:00:00.000Z" })
  ];

  it("เห็นเฉพาะของคนนั้น และใหม่สุดขึ้นก่อน", () => {
    assert.deepEqual(notesForStaff(notes, "ICE").map((item) => item.id), ["b", "a"]);
    assert.deepEqual(notesForStaff(notes, "Boom").map((item) => item.id), ["c"]);
    assert.deepEqual(notesForStaff(notes, "ไม่มีคนนี้"), []);
  });

  it("นับเฉพาะอันที่ยังไม่กดรับทราบ", () => {
    assert.equal(unacknowledgedCount(notesForStaff(notes, "ICE")), 1);
    assert.equal(unacknowledgedCount(notesForStaff(notes, "Boom")), 1);
    assert.equal(unacknowledgedCount([]), 0);
  });

  it("วันที่แสดงเป็นเวลาไทย และค่าเสียไม่ทำให้พัง", () => {
    assert.ok(noteDateLabel("2026-08-20T03:00:00.000Z").length > 0);
    assert.equal(noteDateLabel("ไม่ใช่วันที่"), "ไม่ใช่วันที่".slice(0, 10));
  });
});
