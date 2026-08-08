import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cardStoreWorkflow, phasesForShift } from "../lib/card-store-workflow.ts";
import {
  applyChecklistConfig,
  applyPhaseOrder,
  customPhaseId,
  evidenceForItem,
  formatEditedAt,
  moveChecklistItem,
  moveChecklistItemWithin,
  applyPhaseShifts,
  pruneEvidence,
  resolvePhaseWindow,
  seedShiftsFromPhases,
  seedWindowsFromPhases
} from "../lib/daily-checklist.ts";
import { calculateChecklistScore } from "../lib/performance-score.ts";

const phaseIds = (phases: { id: string }[]) => phases.map((phase) => phase.id);

describe("owner checklist config", () => {
  it("keeps the built-in deadline until the owner sets one", () => {
    assert.equal(resolvePhaseWindow("open-store").dueTime, "13:00");
    assert.equal(resolvePhaseWindow("close-store").openTime, "19:00");
    assert.equal(resolvePhaseWindow("open-store", { "open-store": { dueTime: "10:30" } }).dueTime, "10:30");
    // กะ2 can have its own time for a หัวข้อ both shifts do
    assert.equal(resolvePhaseWindow("stock-work", {}, "s2").dueTime, "23:00");
    assert.equal(resolvePhaseWindow("stock-work", {}, "s1").dueTime, "13:00");
    // an unknown phase is held only to the end of the business day
    assert.equal(resolvePhaseWindow("brand-new-phase").dueTime, "23:59");
  });

  it("reorders หัวข้อ and leaves unlisted ones at the end", () => {
    const reordered = applyPhaseOrder(cardStoreWorkflow, ["close-store", "stock-work"]);

    assert.deepEqual(phaseIds(reordered).slice(0, 2), ["close-store", "stock-work"]);
    assert.equal(reordered.length, cardStoreWorkflow.length);
    // the ones the owner did not mention keep their built-in relative order
    assert.deepEqual(phaseIds(reordered).slice(2), ["open-store", "guild-chat-exp", "daytime-work"]);
  });

  it("moves a หัวข้อ between shifts, and an empty list means both shifts", () => {
    const moved = applyPhaseShifts(cardStoreWorkflow, { "open-store": ["s2"], "close-store": [] });

    assert.deepEqual(phaseIds(phasesForShift(moved, "s2")).includes("open-store"), true);
    assert.deepEqual(phaseIds(phasesForShift(moved, "s1")).includes("open-store"), false);
    // close-store cleared → shared, so both shifts see it
    assert.deepEqual(phaseIds(phasesForShift(moved, "s1")).includes("close-store"), true);
    assert.deepEqual(phaseIds(phasesForShift(moved, "s2")).includes("close-store"), true);
  });

  it("applies items, shifts and order together", () => {
    const applied = applyChecklistConfig(cardStoreWorkflow, {
      overrides: { "open-store": ["ข้อเดียวพอ"] },
      shifts: { "open-store": ["s1", "s2"] },
      order: ["open-store"]
    });

    assert.equal(phaseIds(applied)[0], "open-store");
    assert.deepEqual(applied[0].checklist, ["ข้อเดียวพอ"]);
    assert.deepEqual(applied[0].shift, ["s1", "s2"]);
  });

  it("seeds the editor from whatever the phases carry today", () => {
    const windows = seedWindowsFromPhases(cardStoreWorkflow, {});
    const shifts = seedShiftsFromPhases(cardStoreWorkflow, {});

    assert.equal(windows["close-store"].dueTime, "23:59");
    assert.equal(windows["open-store"].dueTime, "13:00");
    assert.deepEqual(shifts["open-store"], ["s1"]);
    // the built-in กะ2 window shows in the editor (not dropped like resolvePhaseWindow flattens it)
    assert.equal(windows["stock-work"].s2?.dueTime, "23:00");
    assert.equal(windows["stock-work"].s2?.openTime, "19:00");
  });

  it("keeps an owner-edited กะ2 time when the config is reloaded into the editor", () => {
    // Owner sets a กะ2 deadline, saves → Firestore keeps windows[phase].s2.
    const saved = {
      "open-store": { openTime: "09:00", dueTime: "13:00", s2: { openTime: "19:30", dueTime: "22:45" } }
    };
    // Reload path: the editor reseeds from the saved config. The กะ2 time must survive.
    const seeded = seedWindowsFromPhases(cardStoreWorkflow, saved);

    assert.equal(seeded["open-store"].dueTime, "13:00");
    assert.equal(seeded["open-store"].openTime, "09:00");
    assert.equal(seeded["open-store"].s2?.dueTime, "22:45");
    assert.equal(seeded["open-store"].s2?.openTime, "19:30");
  });

  it("keeps a กะ2 start time even when its deadline is left blank (ticket NwHVuEWPjKEFlNaOtFtX)", () => {
    // Ticket case: owner sets only "กะ 2 · เริ่มกดได้ตั้งแต่" and leaves "กะ 2 · กำหนดส่ง" blank
    // (blank = ใช้เวลาเดียวกับกะ 1). The s2 block must survive save → reload...
    const saved = {
      "stock-work": { openTime: "09:00", dueTime: "13:00", s2: { openTime: "20:00" } }
    };
    const seeded = seedWindowsFromPhases(cardStoreWorkflow, saved);
    assert.equal(seeded["stock-work"].s2?.openTime, "20:00");
    assert.equal(seeded["stock-work"].s2?.dueTime, undefined);

    // ...and at render, a blank กะ2 deadline inherits กะ1's deadline while the กะ2 start applies.
    const s2Window = resolvePhaseWindow("stock-work", saved, "s2");
    assert.equal(s2Window.openTime, "20:00");
    assert.equal(s2Window.dueTime, "13:00");
    // กะ1 is untouched.
    assert.equal(resolvePhaseWindow("stock-work", saved, "s1").dueTime, "13:00");
    assert.equal(resolvePhaseWindow("stock-work", saved, "s1").openTime, "09:00");
  });

  it("charges 2 points per หัวข้อ handed in late", () => {
    const result = calculateChecklistScore([
      { type: "late_submit", count: 3, dates: ["2026-08-03", "2026-08-04"], source: "live" }
    ]);

    assert.equal(result.score, 14);
    assert.equal(result.deductions[0].points, 6);
    assert.equal(result.flags.length, 0);
    assert.match(result.deductions[0].detail, /2026-08-03/);
  });
});

describe("owner-managed หัวข้อใหญ่", () => {
  it("adds a หัวข้อ the code never had, with its own items", () => {
    const applied = applyChecklistConfig(cardStoreWorkflow, {
      customPhases: [{ id: "custom-back-room", title: "งานคลังหลังร้าน" }],
      overrides: { "custom-back-room": ["เช็คกล่องพัสดุ", "จัดชั้นสต็อก"] },
      order: ["custom-back-room"]
    });

    assert.equal(phaseIds(applied)[0], "custom-back-room");
    assert.deepEqual(applied[0].checklist, ["เช็คกล่องพัสดุ", "จัดชั้นสต็อก"]);
    // the built-in ones are still there behind it
    assert.equal(applied.length, cardStoreWorkflow.length + 1);
  });

  it("hides a built-in หัวข้อ instead of pretending it can be deleted", () => {
    const applied = applyChecklistConfig(cardStoreWorkflow, { hiddenPhases: ["guild-chat-exp"] });

    assert.equal(phaseIds(applied).includes("guild-chat-exp"), false);
    assert.equal(applied.length, cardStoreWorkflow.length - 1);
  });

  it("renames a หัวข้อ without touching its items", () => {
    const applied = applyChecklistConfig(cardStoreWorkflow, { titles: { "open-store": "เปิดร้าน (กะเช้า)" } });
    const phase = applied.find((item) => item.id === "open-store")!;

    assert.equal(phase.title, "เปิดร้าน (กะเช้า)");
    assert.deepEqual(phase.checklist, cardStoreWorkflow.find((item) => item.id === "open-store")!.checklist);
  });

  it("moves one item from one หัวข้อ to another", () => {
    const before = { "open-store": ["ก", "ข", "ค"], "close-store": ["ง"] };
    const after = moveChecklistItem(before, { phaseId: "open-store", index: 1 }, "close-store");

    assert.deepEqual(after["open-store"], ["ก", "ค"]);
    assert.deepEqual(after["close-store"], ["ง", "ข"]);
    // moving onto itself, or from an empty slot, changes nothing
    assert.equal(moveChecklistItem(before, { phaseId: "open-store", index: 1 }, "open-store"), before);
    assert.equal(moveChecklistItem(before, { phaseId: "open-store", index: 9 }, "close-store"), before);
  });

  it("reorders an item inside its own หัวข้อ", () => {
    const before = { "open-store": ["ก", "ข", "ค"] };

    assert.deepEqual(moveChecklistItemWithin(before, "open-store", 2, -1)["open-store"], ["ก", "ค", "ข"]);
    assert.equal(moveChecklistItemWithin(before, "open-store", 0, -1), before);
  });

  it("requires หลักฐาน (รูป/ลิงก์) on the items the owner marks", () => {
    const evidence = {
      "custom-activity": {
        "โพสต์กิจกรรมลงเพจ": { kinds: ["photo", "link"] as ("photo" | "link")[], note: "แนบรูปโพสต์" }
      }
    };

    const req = evidenceForItem(evidence, "custom-activity", "โพสต์กิจกรรมลงเพจ");
    assert.deepEqual(req?.kinds, ["photo", "link"]);
    assert.equal(req?.note, "แนบรูปโพสต์");
    // whitespace on the lookup text still matches (editor stores trimmed keys)
    assert.ok(evidenceForItem(evidence, "custom-activity", "  โพสต์กิจกรรมลงเพจ  "));
    // an item with no requirement, or an empty kind list, asks for nothing
    assert.equal(evidenceForItem(evidence, "custom-activity", "อย่างอื่น"), undefined);
    assert.equal(evidenceForItem({ "p": { "x": { kinds: [] } } }, "p", "x"), undefined);
  });

  it("drops evidence for items that were deleted or renamed on save", () => {
    const evidence = {
      "custom-activity": {
        "โพสต์กิจกรรม": { kinds: ["photo"] as ("photo" | "link")[] },
        "ข้อที่ลบไปแล้ว": { kinds: ["link"] as ("photo" | "link")[] },
        "ว่างเปล่า": { kinds: [] as ("photo" | "link")[] }
      }
    };
    const overrides = { "custom-activity": ["โพสต์กิจกรรม", "ทำอย่างอื่น"] };

    const pruned = pruneEvidence(evidence, overrides);
    assert.deepEqual(Object.keys(pruned["custom-activity"]), ["โพสต์กิจกรรม"]);
    assert.deepEqual(pruned["custom-activity"]["โพสต์กิจกรรม"].kinds, ["photo"]);
  });

  it("keeps a custom phase id unique and url-safe", () => {
    const first = customPhaseId("งานคลัง หลังร้าน");
    const second = customPhaseId("งานคลัง หลังร้าน", [first]);

    assert.match(first, /^custom-/);
    assert.notEqual(first, second);
  });

  it("formats the last-edited timestamp and hides it when there is none", () => {
    // A real save stamp round-trips to a non-empty Bangkok-time Thai string.
    const shown = formatEditedAt("2026-08-08T05:30:00.000Z");
    assert.ok(shown && shown.length > 0);
    // 05:30 UTC = 12:30 Asia/Bangkok — the Buddhist year (2569) proves the th-TH locale.
    assert.match(shown, /2569/);
    assert.match(shown, /12:30/);
    // Missing / malformed values return null so the editor can hide the line entirely.
    assert.equal(formatEditedAt(null), null);
    assert.equal(formatEditedAt(undefined), null);
    assert.equal(formatEditedAt(""), null);
    assert.equal(formatEditedAt("not-a-date"), null);
  });
});
