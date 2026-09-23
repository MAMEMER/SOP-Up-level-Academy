import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyProgressAction,
  carryOverSpecs,
  clampPercent,
  isUnfinished,
  MAX_PROGRESS_UPDATES,
  normalizeProgressEntry,
  normalizeProgressMap,
  percentOf,
  periodKeyForSchedule,
  progressKey,
  pruneProgressMap,
  splitProgressKey,
  statusLabel,
  summarizeProgress,
  type TaskProgressEntry
} from "../lib/task-progress.ts";

const AT = "2026-09-23T03:00:00.000Z";
const LATER = "2026-09-23T05:00:00.000Z";

function started(percent = 0): TaskProgressEntry {
  return applyProgressAction(undefined, { action: "start", by: "ICE", at: AT, percent })!;
}

describe("รอบของงาน", () => {
  it("รายวันแยกตามวัน · รายสัปดาห์รวมทั้งสัปดาห์ · รายเดือนรวมทั้งเดือน", () => {
    assert.equal(periodKeyForSchedule({ frequency: "daily" }, "2026-09-23"), "2026-09-23");
    // 21 (จันทร์) กับ 23 (พุธ) ก.ย. 2026 อยู่สัปดาห์ ISO เดียวกัน → งานค้างข้ามวันได้
    assert.equal(
      periodKeyForSchedule({ frequency: "weekly" }, "2026-09-21"),
      periodKeyForSchedule({ frequency: "weekly" }, "2026-09-23")
    );
    assert.equal(periodKeyForSchedule({ frequency: "monthly" }, "2026-09-23"), "2026-09");
    assert.equal(periodKeyForSchedule({ frequency: "range", startDate: "2026-09-01" }, "2026-09-23"), "r-2026-09-01");
  });

  it("คีย์งาน+รอบ แยกกลับได้ แม้ชื่องานมีขีด", () => {
    const key = progressKey("w-sleeve", "2026-W39");
    assert.equal(key, "w-sleeve::2026-W39");
    assert.deepEqual(splitProgressKey(key), { taskId: "w-sleeve", periodKey: "2026-W39" });
  });
});

describe("กดเริ่มทำ → อัพเดท % → เสร็จ", () => {
  it("เริ่มทำแล้วอยู่สถานะกำลังทำที่ 0%", () => {
    const entry = started();
    assert.equal(entry.status, "in_progress");
    assert.equal(entry.percent, 0);
    assert.equal(entry.startedBy, "ICE");
    assert.equal(entry.updates.length, 1);
  });

  it("อัพเดท % ได้ และคนอื่นอัพเดทต่อได้ (งานของทีม)", () => {
    const entry = applyProgressAction(started(), { action: "update", by: "BOOM", at: LATER, percent: 60, note: "นับชั้นบนเสร็จ" })!;
    assert.equal(entry.percent, 60);
    assert.equal(entry.updatedBy, "BOOM");
    assert.equal(entry.startedBy, "ICE");
    assert.equal(entry.updates.at(-1)?.note, "นับชั้นบนเสร็จ");
  });

  it("% เกินช่วงถูกบีบเข้า 0–100", () => {
    assert.equal(clampPercent(140), 100);
    assert.equal(clampPercent(-5), 0);
    assert.equal(clampPercent("ไม่ใช่ตัวเลข", 30), 30);
    assert.equal(applyProgressAction(started(), { action: "update", by: "ICE", at: LATER, percent: 999 })!.percent, 100);
  });

  it("กดเสร็จ = 100% + บันทึกว่าใครปิดงาน", () => {
    const entry = applyProgressAction(started(40), { action: "finish", by: "LEO", at: LATER })!;
    assert.equal(entry.status, "done");
    assert.equal(entry.percent, 100);
    assert.equal(entry.doneBy, "LEO");
    assert.equal(entry.doneAt, LATER);
  });

  it("งานสั้นๆ กดเสร็จเลยได้โดยไม่ต้องกดเริ่มก่อน", () => {
    const entry = applyProgressAction(undefined, { action: "finish", by: "ICE", at: AT })!;
    assert.equal(entry.status, "done");
    assert.equal(entry.percent, 100);
    assert.equal(entry.startedBy, "ICE");
  });

  it("กดอัพเดท % ทั้งที่ยังไม่เริ่ม = ไม่มีผล", () => {
    assert.equal(applyProgressAction(undefined, { action: "update", by: "ICE", at: AT, percent: 50 }), null);
  });
});

describe("ติดปัญหา / กลับมาทำต่อ / เปิดงานใหม่", () => {
  it("ติดปัญหาเก็บเหตุผลไว้ และ % ไม่หาย", () => {
    const entry = applyProgressAction(started(30), { action: "stuck", by: "ICE", at: LATER, note: "ของไม่ตรงกับ StoreHub" })!;
    assert.equal(entry.status, "stuck");
    assert.equal(entry.percent, 30);
    assert.equal(entry.blockedNote, "ของไม่ตรงกับ StoreHub");
  });

  it("กลับมาทำต่อ ล้างเหตุผลที่ติดทิ้ง", () => {
    const stuck = applyProgressAction(started(30), { action: "stuck", by: "ICE", at: LATER, note: "ของขาด" })!;
    const resumed = applyProgressAction(stuck, { action: "resume", by: "ICE", at: LATER })!;
    assert.equal(resumed.status, "in_progress");
    assert.equal(resumed.blockedNote, undefined);
  });

  it("เปิดงานที่ปิดไปแล้วใหม่ กลับไปที่ % ก่อนกดเสร็จ ไม่เด้งเป็น 0", () => {
    const progressed = applyProgressAction(started(), { action: "update", by: "ICE", at: AT, percent: 70 })!;
    const done = applyProgressAction(progressed, { action: "finish", by: "ICE", at: LATER })!;
    const reopened = applyProgressAction(done, { action: "reopen", by: "BOOM", at: LATER })!;
    assert.equal(reopened.status, "in_progress");
    assert.equal(reopened.percent, 70);
    assert.equal(reopened.doneBy, undefined);
  });

  it("ยกเลิกทั้งหมด = ลบทิ้ง กลับไปยังไม่เริ่ม", () => {
    assert.equal(applyProgressAction(started(50), { action: "clear", by: "ICE", at: LATER }), null);
  });

  it("ไทม์ไลน์เก็บได้จำกัด ไม่โตไม่สิ้นสุด", () => {
    let entry = started();
    for (let index = 0; index < MAX_PROGRESS_UPDATES + 5; index += 1) {
      entry = applyProgressAction(entry, { action: "update", by: "ICE", at: LATER, percent: index })!;
    }
    assert.equal(entry.updates.length, MAX_PROGRESS_UPDATES);
  });
});

describe("สรุปภาพรวม", () => {
  it("นับเสร็จ/กำลังทำ/ติดปัญหา/ยังไม่เริ่ม และเฉลี่ย %", () => {
    const summary = summarizeProgress([
      { done: true },
      { done: false, entry: started(50) },
      { done: false, entry: applyProgressAction(started(20), { action: "stuck", by: "ICE", at: LATER, note: "รอของ" })! },
      { done: false }
    ]);
    assert.deepEqual(summary, { total: 4, done: 1, active: 1, stuck: 1, notStarted: 1, percent: 43 });
  });

  it("ติ๊กเสร็จแบบเดิม (ไม่มีโปรเกรส) ยังนับเป็น 100%", () => {
    assert.equal(percentOf(undefined, true), 100);
    assert.equal(statusLabel(undefined, true), "เสร็จแล้ว");
    assert.equal(statusLabel(undefined, false), "ยังไม่เริ่ม");
    assert.equal(statusLabel(started(45), false), "กำลังทำ 45%");
  });

  it("งานที่เริ่มแล้วยังไม่เสร็จ = งานค้าง ต้องตามไปทำต่อ", () => {
    assert.equal(isUnfinished(started(10), false), true);
    assert.equal(isUnfinished(started(10), true), false);
    assert.equal(isUnfinished(undefined, false), false);
  });
});

describe("งานค้างข้ามวัน", () => {
  const specs = [
    { id: "count", active: true, schedule: { frequency: "weekly" as const, weekdays: [1] } },
    { id: "clean", active: true, schedule: { frequency: "weekly" as const, weekdays: [1] } },
    { id: "off", active: false, schedule: { frequency: "weekly" as const, weekdays: [1] } }
  ];

  it("งานรายสัปดาห์ที่เริ่มวันจันทร์แล้วยังไม่เสร็จ ยังขึ้นให้เห็นวันพุธ", () => {
    const progress = { [progressKey("count", "2026-W39")]: started(40) };
    const carried = carryOverSpecs(specs, { date: "2026-09-23", dueIds: [], progress });
    assert.deepEqual(carried.map((spec) => spec.id), ["count"]);
  });

  it("ไม่ดันซ้ำถ้างานขึ้นในลิสต์วันนี้อยู่แล้ว · ไม่ดันงานที่ปิดไว้ · ไม่ดันงานที่ส่งแล้ว", () => {
    const progress = {
      [progressKey("count", "2026-W39")]: started(40),
      [progressKey("clean", "2026-W39")]: started(10),
      [progressKey("off", "2026-W39")]: started(10)
    };
    const carried = carryOverSpecs(specs, {
      date: "2026-09-23",
      dueIds: new Set(["count"]),
      doneIds: ["clean"],
      progress
    });
    assert.deepEqual(carried, []);
  });
});

describe("ล้างข้อมูลที่อ่านมาจากฐานข้อมูล", () => {
  it("ทิ้ง entry ที่ไม่มีคนเริ่ม/เวลาเริ่ม", () => {
    assert.equal(normalizeProgressEntry({ status: "in_progress", percent: 50 }), null);
    assert.equal(normalizeProgressEntry(null), null);
  });

  it("เก็บเฉพาะฟิลด์ที่รู้จัก และบีบ % ให้อยู่ในช่วง", () => {
    const entry = normalizeProgressEntry({
      status: "in_progress",
      percent: 500,
      startedBy: "ICE",
      startedAt: AT,
      updates: [{ kind: "start", by: "ICE", at: AT, percent: 0 }, { kind: "ไม่รู้จัก", by: "X", at: AT }]
    });
    assert.equal(entry?.percent, 100);
    assert.equal(entry?.updates.length, 1);
    assert.equal(entry?.updatedBy, "ICE");
  });

  it("แผนที่ทั้งก้อน: ข้ามอันที่พัง และตัดของเก่าทิ้งเมื่อเกินลิมิต", () => {
    const map = normalizeProgressMap({ "a::2026-09-23": started(10), "b::2026-09-23": { percent: 1 } });
    assert.deepEqual(Object.keys(map), ["a::2026-09-23"]);

    const many: Record<string, TaskProgressEntry> = {};
    for (let index = 0; index < 5; index += 1) {
      many[`t${index}::2026-09-2${index}`] = { ...started(), updatedAt: `2026-09-2${index}T00:00:00.000Z` };
    }
    const pruned = pruneProgressMap(many, 2);
    assert.deepEqual(Object.keys(pruned).sort(), ["t3::2026-09-23", "t4::2026-09-24"]);
  });
});
