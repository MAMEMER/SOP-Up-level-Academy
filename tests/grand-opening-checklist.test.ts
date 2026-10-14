import assert from "node:assert/strict";
import test from "node:test";
import { initialOpeningBoard, changeOpeningCategory, activeOpeningRows, openingQuantity, openingActivityText, openingRelativeTime, emptyOpening, filterOpeningItems, initialOpeningItems, mergeOpeningItems, newOpening, openingProgress, openingSchema, stampOpening, validOpeningImage } from "../lib/grand-opening-checklist.ts";
const fields = { ...emptyOpening, title: "โต๊ะ" };
test("validation trims title; optional quantities remain null; rejects unsafe fields and numbers", () => {
  assert.equal(openingSchema.parse({ ...fields, title: " โต๊ะ " }).title, "โต๊ะ");
  assert.equal(openingSchema.parse(fields).qtyHave, null);
  for (const bad of [{ title: " " }, { category: "" }, { day: "19" }, { qtyHave: -1 }, { qtyNeeded: Infinity }, { qtyHave: "3" }, { qtyNeeded: 1000001 }, { updatedBy: "ปลอม" }]) assert.equal(openingSchema.safeParse({ ...fields, ...bad }).success, false);
  assert.equal(openingSchema.parse({ ...fields, qtyHave: 0, qtyNeeded: 1.5 }).qtyNeeded, 1.5);
});
test("tick stamps actor and server time; untick clears stamp but preserves creator", () => {
  const original = newOpening("test", fields, "มุก", "2026-10-14T01:00:00Z");
  const done = stampOpening(original, true, "เนม", "2026-10-14T02:00:00Z");
  assert.equal(done.done, true); assert.equal(done.doneBy, "เนม"); assert.equal(done.doneAt, "2026-10-14T02:00:00Z");
  const undone = stampOpening(done, false, "แชมป์", "2026-10-14T03:00:00Z");
  assert.equal(undone.done, false); assert.equal(undone.doneBy, null); assert.equal(undone.doneAt, null);
  assert.equal(undone.createdBy, "มุก"); assert.equal(undone.createdAt, original.createdAt); assert.equal(undone.updatedBy, "แชมป์"); assert.equal(undone.updatedAt, "2026-10-14T03:00:00Z"); assert.equal(original.done, false);
});
test("progress counts active items overall and in all four categories", () => {
  const rows = [stampOpening(initialOpeningItems[0], true, "มุก", "now"), initialOpeningItems[8], { ...initialOpeningItems[1], deleted: true, done: true }];
  const progress = openingProgress(rows);
  assert.deepEqual(progress.overall, { done: 1, total: 2 });
  assert.deepEqual(progress.categories.map(({ done, total }) => [done, total]), [[1, 1], [0, 1], [0, 0], [0, 0]]);
});
test("filters combine status with day; both-day items appear on each date; no-day only in all", () => {
  const rows = [newOpening("a", { ...fields, day: "17" }, "มุก", null), stampOpening(newOpening("b", { ...fields, day: "18" }, "มุก", null), true, "เนม", "now"), newOpening("c", fields, "มุก", null), newOpening("d", { ...fields, day: "" }, "มุก", null), { ...newOpening("e", fields, "มุก", null), deleted: true }];
  assert.deepEqual(filterOpeningItems(rows, "", "17").map(r => r.id), ["a", "c"]);
  assert.deepEqual(filterOpeningItems(rows, "done", "18").map(r => r.id), ["b"]);
  assert.deepEqual(filterOpeningItems(rows, "pending", "18").map(r => r.id), ["c"]);
  assert.deepEqual(filterOpeningItems(rows, "", "ทั้งสองวัน").map(r => r.id), ["c"]);
  assert.equal(filterOpeningItems(rows).length, 4);
});
test("seeds are idempotent and retain edits, custom rows, and deletion tombstones", () => {
  assert.equal(initialOpeningItems.length, 37);
  const edit = { ...initialOpeningItems[0], title: "โต๊ะพร้อม", qtyHave: 43, revision: 3 };
  const deleted = { ...initialOpeningItems[1], deleted: true };
  const custom = newOpening("custom", fields, "มุก", null);
  const once = mergeOpeningItems([edit, deleted, custom]);
  assert.deepEqual(mergeOpeningItems(once), once); assert.equal(once.length, 38);
  assert.equal(once.find(r => r.id === edit.id)?.title, "โต๊ะพร้อม");
  assert.equal(filterOpeningItems(mergeOpeningItems(once)).some(r => r.id === deleted.id), false);
  assert.equal(initialOpeningItems[0].qtyNeeded, 43);
  assert.ok(initialOpeningItems.every(r => !r.assignee && !r.done));
  for (const row of initialOpeningItems) { assert.ok(openingSchema.safeParse({ title: row.title, category: row.category, day: row.day, qtyNeeded: row.qtyNeeded, qtyHave: row.qtyHave, assignee: row.assignee, note: row.note }).success); if (/Lorcana|Pre-release|Pack Rush/.test(row.title)) assert.equal(row.day, "17"); if (/PKM|Riftbound/.test(row.title)) assert.equal(row.day, "18"); }
});

test("only browser-displayable raster images within the upload limit are accepted", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp", "image/gif"]) assert.ok(validOpeningImage(type, 100));
  for (const [type, size] of [["image/svg+xml", 100], ["application/pdf", 100], ["image/heic", 100], ["image/jpeg", 0], ["image/jpeg", 4194305]] as const) assert.equal(validOpeningImage(type, size), false);
});

test("banner progress excludes deleted items and categories; rename retains items; reorder and tombstones persist", () => {
  const rows = [stampOpening(initialOpeningItems[0], true, "เนม", "2026-10-14T00:00:00Z"), initialOpeningItems[8]];
  let board = changeOpeningCategory(initialOpeningBoard, "category-rename", rows[0].category, "พื้นที่");
  assert.equal(activeOpeningRows(rows, board).length, 2);
  assert.deepEqual(openingProgress(activeOpeningRows(rows, board)).overall, { done: 1, total: 2 });
  board = changeOpeningCategory(board, "category-add", "new", "หมวดใหม่");
  board = changeOpeningCategory(board, "category-move", "new", "", -1);
  assert.equal(board.categories[3].id, "new");
  board = changeOpeningCategory(board, "category-delete", rows[0].category);
  assert.deepEqual(openingProgress(activeOpeningRows(rows, board)).overall, { done: 0, total: 1 });
  assert.equal(initialOpeningBoard.categories[0].deleted, false);
  assert.throws(() => changeOpeningCategory(board, "category-rename", rows[0].category, "กลับมา"));
});
test("quantity +/- clamps bounds and activity feed labels all collaboration actions", () => {
  assert.equal(openingQuantity(null, 1), 1); assert.equal(openingQuantity(0, -1), 0); assert.equal(openingQuantity(1000000, 1), 1000000);
  for (const action of ["tick", "untick", "add", "save", "delete", "quantity", "image-add", "image-delete", "category-add", "category-rename", "category-delete", "category-move"]) {
    const text = openingActivityText({ id: "x", at: "2026-10-14T00:00:00Z", by: "เนม", title: "โต๊ะ", action });
    assert.ok(text.startsWith("เนม ")); assert.ok(text.endsWith(" โต๊ะ")); assert.ok(!text.includes(action));
  }
  assert.equal(openingRelativeTime("2026-10-14T00:00:00Z", Date.parse("2026-10-14T00:02:00Z")), "2 นาทีที่แล้ว");
});
