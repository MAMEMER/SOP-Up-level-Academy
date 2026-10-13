import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildClipBriefDoc,
  markPendingWithBriefs,
  normalizeFolderKey,
  resolveSince,
  validateClipBrief,
  validatePendingFolders,
  validateUsed
} from "../lib/clip-briefs.ts";
import { keysMatch, machineAuthStatus } from "../lib/clip-briefs-key.ts";

const good = {
  folder: "เปิดซอง Riftbound 12 ต.ค.",
  goal: "pack_opening",
  hook: "ได้ Jinx alt art ซองที่ 3 ราวนาทีที่ 1 ไฟล์ IMG_0412",
  highlights: "รีแอคชั่นตอนเปิด",
  musicMood: "hype"
};

describe("normalizeFolderKey", () => {
  it("ตัวเล็ก ตัดช่องว่าง/เครื่องหมาย", () => {
    assert.equal(normalizeFolderKey("  Riftbound - Pack #1! "), "riftboundpack1");
    assert.equal(normalizeFolderKey("riftbound_pack 1"), "riftboundpack1");
  });
  it("เก็บสระ/วรรณยุกต์ไทย และ NFC ให้ชื่อเดียวกันได้ key เดียวกัน", () => {
    assert.equal(normalizeFolderKey("เปิดซอง 12 ต.ค."), "เปิดซอง12ตค");
    assert.equal(normalizeFolderKey("Café"), normalizeFolderKey("Café"));
  });
});

describe("validateClipBrief", () => {
  it("ผ่านเมื่อครบช่องบังคับ และ default เพลง = ให้ AI เลือก", () => {
    const res = validateClipBrief({ ...good, musicMood: "" });
    assert.ok(res.ok);
    if (res.ok) {
      assert.equal(res.value.musicMood, "ai_pick");
      assert.equal(res.value.mustAvoid, "");
    }
  });
  it("ไม่มีโฟลเดอร์ / มี / ในชื่อ / ไม่มีฮุก / goal มั่ว → ไม่ผ่าน", () => {
    assert.equal(validateClipBrief({ ...good, folder: " " }).ok, false);
    assert.equal(validateClipBrief({ ...good, folder: "Footage/abc" }).ok, false);
    assert.equal(validateClipBrief({ ...good, folder: "---" }).ok, false);
    assert.equal(validateClipBrief({ ...good, hook: "" }).ok, false);
    assert.equal(validateClipBrief({ ...good, goal: "viral" }).ok, false);
    assert.equal(validateClipBrief({ ...good, musicMood: "metal" }).ok, false);
    assert.equal(validateClipBrief(null).ok, false);
  });
  it("อื่นๆ ต้องพิมพ์รายละเอียด", () => {
    assert.equal(validateClipBrief({ ...good, goal: "other" }).ok, false);
    assert.equal(validateClipBrief({ ...good, goal: "other", goalNote: "คลิปวันเกิดร้าน" }).ok, true);
  });
  it("ข้อความยาวเกินถูกปัด", () => {
    assert.equal(validateClipBrief({ ...good, highlights: "x".repeat(2001) }).ok, false);
  });
});

describe("buildClipBriefDoc", () => {
  it("ใส่ folderKey, label, ผู้ส่ง, usedByJob: null", () => {
    const res = validateClipBrief(good);
    assert.ok(res.ok);
    if (!res.ok) return;
    const doc = buildClipBriefDoc(res.value, { id: "boom", name: "Boom", email: "b@x" }, "2026-10-13T05:00:00.000Z");
    assert.equal(doc.folderKey, "เปิดซองriftbound12ตค");
    assert.equal(doc.goalLabel, "เปิดซอง/โชว์การ์ด");
    assert.equal(doc.musicMoodLabel, "มันส์/เร้าใจ");
    assert.equal(doc.usedByJob, null);
    assert.deepEqual(doc.submittedBy, { id: "boom", name: "Boom", email: "b@x" });
  });
});

describe("resolveSince", () => {
  const now = new Date("2026-10-13T00:00:00.000Z");
  it("ว่าง = ย้อน 14 วัน", () => assert.equal(resolveSince(null, now), "2026-09-29T00:00:00.000Z"));
  it("ISO ปกติ", () => assert.equal(resolveSince("2026-10-01T07:00:00+07:00", now), "2026-10-01T00:00:00.000Z"));
  it("ผิดรูป = null", () => assert.equal(resolveSince("yesterday", now), null));
});

describe("validatePendingFolders", () => {
  it("รับ files เป็นจำนวนหรือรายชื่อไฟล์ firstSeen เป็น ISO หรือ epoch", () => {
    const res = validatePendingFolders({
      folders: [
        { folder: "A b", files: 3, firstSeen: "2026-10-12T10:00:00Z" },
        { folder: "C", files: ["1.mov", "2.mov"], firstSeen: Date.parse("2026-10-11T00:00:00Z") },
        { folder: "D" }
      ]
    });
    assert.ok(res.ok);
    if (!res.ok) return;
    assert.deepEqual(res.value[0], { folder: "A b", folderKey: "ab", files: 3, firstSeen: "2026-10-12T10:00:00.000Z" });
    assert.deepEqual(res.value[1].files, ["1.mov", "2.mov"]);
    assert.equal(res.value[1].firstSeen, "2026-10-11T00:00:00.000Z");
    assert.equal(res.value[2].files, 0);
    assert.equal(res.value[2].firstSeen, "");
  });
  it("ปฏิเสธ body ที่ผิด", () => {
    assert.equal(validatePendingFolders({}).ok, false);
    assert.equal(validatePendingFolders({ folders: [{ folder: "" }] }).ok, false);
    assert.equal(validatePendingFolders({ folders: [{ folder: "a", files: "x" }] }).ok, false);
    assert.equal(validatePendingFolders({ folders: [] }).ok, true);
  });
});

describe("validateUsed", () => {
  it("job เป็น string หรือ object", () => {
    assert.deepEqual(validateUsed({ id: "abc", job: " job-1 " }), { ok: true, value: { id: "abc", job: "job-1" } });
    assert.deepEqual(validateUsed({ id: "abc", job: { id: "j", out: "x.mp4" } }), { ok: true, value: { id: "abc", job: { id: "j", out: "x.mp4" } } });
  });
  it("id/job ผิด", () => {
    assert.equal(validateUsed({ id: "a/b", job: "x" }).ok, false);
    assert.equal(validateUsed({ id: "a", job: "" }).ok, false);
    assert.equal(validateUsed({ id: "a", job: [1] }).ok, false);
  });
});

describe("machine key", () => {
  it("เทียบ key", () => {
    assert.equal(keysMatch("secret", "secret"), true);
    assert.equal(keysMatch("secreT", "secret"), false);
    assert.equal(keysMatch("", "secret"), false);
    assert.equal(keysMatch(null, "secret"), false);
  });
  it("env ไม่ตั้ง = 503, ผิด = 401, ถูก = 200", () => {
    assert.equal(machineAuthStatus("x", undefined), 503);
    assert.equal(machineAuthStatus("x", ""), 503);
    assert.equal(machineAuthStatus("x", "y"), 401);
    assert.equal(machineAuthStatus(null, "y"), 401);
    assert.equal(machineAuthStatus("y", "y"), 200);
  });
});

describe("markPendingWithBriefs", () => {
  it("ยังไม่มีบรีฟขึ้นก่อน เก่าก่อนใหม่", () => {
    const rows = markPendingWithBriefs(
      [
        { folder: "B", folderKey: "b", files: 1, firstSeen: "2026-10-12T00:00:00.000Z" },
        { folder: "A", folderKey: "a", files: 1, firstSeen: "2026-10-10T00:00:00.000Z" },
        { folder: "C", folderKey: "c", files: 1, firstSeen: "2026-10-11T00:00:00.000Z" }
      ],
      ["a"]
    );
    assert.deepEqual(rows.map((r) => [r.folder, r.hasBrief]), [["C", false], ["B", false], ["A", true]]);
  });
});
