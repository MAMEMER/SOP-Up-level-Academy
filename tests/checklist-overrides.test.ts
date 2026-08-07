import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyEventChecklistOverride,
  applyEventMetaOverride,
  applyStringPhaseOverride,
  itemsFromStrings,
  makeCustomEventItem,
  normalizeChecklistOverrides,
  normalizeUnitOverride,
  type OverrideItem
} from "../lib/checklist-overrides.ts";
import { weeklyStockSleevePhase } from "../lib/weekly-stock-workflow.ts";
import { monthlyStockSinglePhase } from "../lib/monthly-stock-single-workflow.ts";
import { weeklyEvents } from "../lib/weekly-event-tasks.ts";

describe("checklist overrides — string phases (weekly/monthly stock)", () => {
  it("returns the built-in phase unchanged when no override is set", () => {
    assert.deepEqual(applyStringPhaseOverride(weeklyStockSleevePhase, undefined), weeklyStockSleevePhase);
    assert.deepEqual(applyStringPhaseOverride(weeklyStockSleevePhase, {}), weeklyStockSleevePhase);
  });

  it("replaces title, goal and items when the owner edits them", () => {
    const next = applyStringPhaseOverride(weeklyStockSleevePhase, {
      title: "Stock อุปกรณ์ (ใหม่)",
      goal: "นับใหม่",
      items: [
        { id: "item-1", title: "ขั้นตอนแรก" },
        { id: "item-2", title: "ขั้นตอนสอง" }
      ]
    });
    assert.equal(next.title, "Stock อุปกรณ์ (ใหม่)");
    assert.equal(next.goal, "นับใหม่");
    assert.deepEqual(next.checklist, ["ขั้นตอนแรก", "ขั้นตอนสอง"]);
    // built-in object is not mutated
    assert.notEqual(weeklyStockSleevePhase.title, next.title);
    assert.equal(weeklyStockSleevePhase.checklist.length > 0, true);
  });

  it("drops blank items and trims text", () => {
    const next = applyStringPhaseOverride(monthlyStockSinglePhase, {
      items: [
        { id: "a", title: "  เก็บ  " },
        { id: "b", title: "   " },
        { id: "c", title: "นับ" }
      ]
    });
    assert.deepEqual(next.checklist, ["เก็บ", "นับ"]);
  });

  it("seeds editable items from the built-in string checklist", () => {
    const items = itemsFromStrings(weeklyStockSleevePhase.checklist);
    assert.equal(items.length, weeklyStockSleevePhase.checklist.length);
    assert.equal(items[0].title, weeklyStockSleevePhase.checklist[0]);
    assert.equal(items[0].id, "item-1");
  });

  it("overrides เวลา (timeLabel) and กะที่รับผิดชอบ (shiftLabel) without touching the rest", () => {
    const next = applyStringPhaseOverride(weeklyStockSleevePhase, {
      timeLabel: "ทุกวันจันทร์ 10:00-13:00",
      shiftLabel: "กะ 1"
    });
    assert.equal(next.timeLabel, "ทุกวันจันทร์ 10:00-13:00");
    assert.equal(next.shiftLabel, "กะ 1");
    // untouched fields keep the built-in value, and the base object is not mutated
    assert.equal(next.title, weeklyStockSleevePhase.title);
    assert.deepEqual(next.checklist, weeklyStockSleevePhase.checklist);
    assert.equal(weeklyStockSleevePhase.shiftLabel, undefined);
  });

  it("applies เวลา/กะ to the monthly phase too", () => {
    const next = applyStringPhaseOverride(monthlyStockSinglePhase, { timeLabel: "11:00-20:00", shiftLabel: "ทุกกะ" });
    assert.equal(next.timeLabel, "11:00-20:00");
    assert.equal(next.shiftLabel, "ทุกกะ");
  });
});

describe("checklist overrides — weekly event เวลา / กะ meta", () => {
  const event = weeklyEvents.find((item) => item.key === "gym-pokemon");
  assert.ok(event, "gym-pokemon event exists");

  it("returns the event unchanged when no override is set", () => {
    assert.deepEqual(applyEventMetaOverride(event, undefined), event);
    assert.deepEqual(applyEventMetaOverride(event, {}), event);
  });

  it("replaces timeWindow from timeLabel and sets shiftLabel", () => {
    const next = applyEventMetaOverride(event, { timeLabel: "17:00-23:00 ของวันกิจกรรม", shiftLabel: "กะ 2" });
    assert.equal(next.timeWindow, "17:00-23:00 ของวันกิจกรรม");
    assert.equal(next.shiftLabel, "กะ 2");
    // base object untouched
    assert.equal(event.shiftLabel, undefined);
    assert.notEqual(event.timeWindow, next.timeWindow);
  });
});

describe("checklist overrides — weekly event checklist", () => {
  const event = weeklyEvents.find((item) => item.key === "lorcana");
  assert.ok(event, "lorcana event exists");

  it("keeps the built-in checklist when no items override is set", () => {
    const out = applyEventChecklistOverride(event.checklist, undefined, makeCustomEventItem);
    assert.deepEqual(out, event.checklist);
  });

  it("rewords an item title but keeps its requiredData/evidence", () => {
    const first = event.checklist[0];
    const items: OverrideItem[] = event.checklist.map((item) => ({ id: item.id, title: item.title }));
    items[0] = { id: first.id, title: "Final ของแจก (แก้ไข)" };
    const out = applyEventChecklistOverride(event.checklist, { items }, makeCustomEventItem);
    assert.equal(out[0].title, "Final ของแจก (แก้ไข)");
    assert.deepEqual(out[0].requiredData, first.requiredData);
    assert.deepEqual(out[0].evidence, first.evidence);
  });

  it("drops removed items and appends owner-added simple ticks", () => {
    const items: OverrideItem[] = [
      { id: event.checklist[0].id, title: event.checklist[0].title },
      { id: "custom-extra", title: "ถ่ายรูปหมู่ตอนจบ" }
    ];
    const out = applyEventChecklistOverride(event.checklist, { items }, makeCustomEventItem);
    assert.equal(out.length, 2);
    assert.equal(out[1].id, "custom-extra");
    assert.equal(out[1].title, "ถ่ายรูปหมู่ตอนจบ");
    assert.deepEqual(out[1].requiredData, []);
    assert.deepEqual(out[1].evidence, []);
  });
});

describe("checklist overrides — normalize", () => {
  it("drops empty units and blank fields", () => {
    const out = normalizeChecklistOverrides({
      good: { title: "  ok  ", items: [{ id: "x", title: "hi" }] },
      empty: { title: "   " },
      blankItems: { items: [{ id: "y", title: "  " }] }
    });
    assert.deepEqual(Object.keys(out), ["good", "blankItems"]);
    assert.equal(out.good.title, "ok");
    // blankItems keeps an explicit empty list (owner cleared the checklist on purpose)
    assert.deepEqual(out.blankItems.items, []);
  });

  it("returns undefined for a meaningless override", () => {
    assert.equal(normalizeUnitOverride({}), undefined);
    assert.equal(normalizeUnitOverride({ title: "  " }), undefined);
    assert.equal(normalizeUnitOverride({ timeLabel: "   ", shiftLabel: "  " }), undefined);
    assert.equal(normalizeUnitOverride(undefined), undefined);
  });

  it("keeps and trims เวลา / กะ fields", () => {
    const out = normalizeUnitOverride({ timeLabel: "  10:00-13:00  ", shiftLabel: "  กะ 1  " });
    assert.deepEqual(out, { timeLabel: "10:00-13:00", shiftLabel: "กะ 1" });
  });
});
