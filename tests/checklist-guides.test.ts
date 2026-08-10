import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { guideForItem, pruneGuides, type ChecklistGuides } from "../lib/daily-checklist.ts";
import {
  applyEventChecklistOverride,
  applyStringPhaseOverride,
  makeCustomEventItem,
  normalizeOverrideItem,
  normalizeUnitOverride,
  resolvePhaseChecklistItems,
  itemsFromStrings,
  type OverrideItem
} from "../lib/checklist-overrides.ts";
import { weeklyStockSleevePhase } from "../lib/weekly-stock-workflow.ts";
import { weeklyEvents } from "../lib/weekly-event-tasks.ts";

describe("daily checklist guides — guideForItem", () => {
  const guides: ChecklistGuides = {
    "open-store": {
      "เปิดร้าน": {
        note: "  เปิดไฟและแอร์ก่อน  ",
        links: [
          { label: "  StoreHub  ", url: "  https://uplevel.storehubhq.com  " },
          { label: "bad", url: "http://insecure" }
        ]
      },
      "ล้างมือ": { note: "   ", links: [] }
    }
  };

  it("returns the cleaned note + valid links (dropping invalid ones)", () => {
    const guide = guideForItem(guides, "open-store", "เปิดร้าน");
    assert.deepEqual(guide, {
      note: "เปิดไฟและแอร์ก่อน",
      links: [{ label: "StoreHub", url: "https://uplevel.storehubhq.com" }]
    });
  });

  it("follows the item by trimmed text", () => {
    assert.ok(guideForItem(guides, "open-store", "  เปิดร้าน  "));
  });

  it("returns undefined when the item has neither note nor valid link", () => {
    assert.equal(guideForItem(guides, "open-store", "ล้างมือ"), undefined);
    assert.equal(guideForItem(guides, "open-store", "ไม่มี"), undefined);
    assert.equal(guideForItem(undefined, "open-store", "เปิดร้าน"), undefined);
  });
});

describe("daily checklist guides — pruneGuides", () => {
  it("drops guides for items that no longer exist or ended up empty", () => {
    const guides: ChecklistGuides = {
      "open-store": {
        "เปิดร้าน": { note: "ยังอยู่" },
        "ลบทิ้งแล้ว": { note: "ควรถูกตัด" },
        "ว่างเปล่า": { note: "  ", links: [] }
      },
      "gone-phase": { "x": { note: "ทั้ง phase หาย" } }
    };
    const out = pruneGuides(guides, { "open-store": ["เปิดร้าน", "อย่างอื่น"] });
    assert.deepEqual(out, { "open-store": { "เปิดร้าน": { note: "ยังอยู่" } } });
  });

  it("returns {} for empty input", () => {
    assert.deepEqual(pruneGuides({}, {}), {});
  });
});

describe("weekly/monthly overrides — note + links per item", () => {
  it("normalizeOverrideItem trims title/note and keeps only valid links", () => {
    const out = normalizeOverrideItem(
      {
        id: "step-1",
        title: "  นับสต๊อก  ",
        note: "  เทียบกับ StoreHub  ",
        links: [
          { label: "", url: "https://uplevel.storehubhq.com/x" },
          { label: "no", url: "javascript:void(0)" }
        ]
      },
      0
    );
    assert.deepEqual(out, {
      id: "step-1",
      title: "นับสต๊อก",
      note: "เทียบกับ StoreHub",
      links: [{ label: "", url: "https://uplevel.storehubhq.com/x" }]
    });
  });

  it("normalizeOverrideItem omits empty note/links entirely (backward compatible)", () => {
    const out = normalizeOverrideItem({ id: "a", title: "แค่ติ๊ก" }, 0);
    assert.deepEqual(out, { id: "a", title: "แค่ติ๊ก" });
    assert.equal("note" in out, false);
    assert.equal("links" in out, false);
  });

  it("normalizeUnitOverride carries note/links through the items array", () => {
    const clean = normalizeUnitOverride({
      items: [
        { id: "s1", title: "ทำ A", note: "รายละเอียด A", links: [{ label: "Sheet", url: "https://docs.google.com/x" }] },
        { id: "s2", title: "ทำ B" }
      ]
    });
    assert.ok(clean?.items);
    assert.equal(clean.items[0].note, "รายละเอียด A");
    assert.deepEqual(clean.items[0].links, [{ label: "Sheet", url: "https://docs.google.com/x" }]);
    assert.equal("note" in clean.items[1], false);
  });

  it("applyStringPhaseOverride still returns a plain string[] checklist", () => {
    const next = applyStringPhaseOverride(weeklyStockSleevePhase, {
      items: [
        { id: "a", title: "นับ", note: "n", links: [{ label: "", url: "/x" }] },
        { id: "b", title: "สรุป" }
      ]
    });
    assert.deepEqual(next.checklist, ["นับ", "สรุป"]);
  });

  it("resolvePhaseChecklistItems lines up with the string checklist and carries note/links", () => {
    const base = itemsFromStrings(weeklyStockSleevePhase.checklist);
    // no override → built-in items, no note/links
    assert.deepEqual(resolvePhaseChecklistItems(base, undefined), base);
    // with override → owner's items with note/links, same order as applyStringPhaseOverride
    const override = {
      items: [
        { id: "a", title: "นับ", note: "ดูใน StoreHub", links: [{ label: "", url: "https://uplevel.storehubhq.com" }] },
        { id: "b", title: "สรุป" }
      ]
    };
    const items = resolvePhaseChecklistItems(base, override);
    const checklist = applyStringPhaseOverride(weeklyStockSleevePhase, override).checklist;
    assert.equal(items.length, checklist.length);
    assert.equal(items[0].title, checklist[0]);
    assert.equal(items[0].note, "ดูใน StoreHub");
    assert.deepEqual(items[1].links, undefined);
  });
});

describe("weekly event overrides — note + links", () => {
  const event = weeklyEvents.find((item) => item.key === "lorcana");
  assert.ok(event, "lorcana event exists");

  it("attaches owner note/links onto a reworded base item", () => {
    const items: OverrideItem[] = event.checklist.map((item) => ({ id: item.id, title: item.title }));
    items[0] = {
      id: event.checklist[0].id,
      title: "Final ของแจก",
      note: "final ก่อน 1 ชม.",
      links: [{ label: "คู่มือ", url: "https://guild.uplevelguild.com/admin" }]
    };
    const out = applyEventChecklistOverride(event.checklist, { items }, makeCustomEventItem);
    assert.equal(out[0].note, "final ก่อน 1 ชม.");
    assert.deepEqual(out[0].links, [{ label: "คู่มือ", url: "https://guild.uplevelguild.com/admin" }]);
    // requiredData/evidence of the base item are preserved
    assert.deepEqual(out[0].requiredData, event.checklist[0].requiredData);
  });

  it("owner-added custom item carries its note/links", () => {
    const items: OverrideItem[] = [
      { id: "custom-x", title: "ถ่ายรูปหมู่", note: "ก่อนแยกย้าย", links: [{ label: "", url: "/handoff" }] }
    ];
    const out = applyEventChecklistOverride(event.checklist, { items }, makeCustomEventItem);
    assert.equal(out.length, 1);
    assert.equal(out[0].note, "ก่อนแยกย้าย");
    assert.deepEqual(out[0].links, [{ label: "", url: "/handoff" }]);
  });
});
