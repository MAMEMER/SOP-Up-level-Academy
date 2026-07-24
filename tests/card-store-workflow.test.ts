import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cardStoreWorkflow, phasesForShift, stockWorkSummaryCards, workflowManualHref } from "../lib/card-store-workflow.ts";

describe("card store workflow content", () => {
  it("covers the full day from opening preparation to closing", () => {
    assert.deepEqual(cardStoreWorkflow.map((phase) => phase.title), ["เปิดร้าน", "Stock", "จัดส่งสินค้า", "ปิดร้าน"]);
  });

  it("separates stock from daytime shipping work", () => {
    const stock = cardStoreWorkflow.find((phase) => phase.title === "Stock");
    const daytime = cardStoreWorkflow.find((phase) => phase.title === "จัดส่งสินค้า");
    const closing = cardStoreWorkflow.find((phase) => phase.title === "ปิดร้าน");

    assert.deepEqual(stock?.sections.map((section) => section.title), [
      "Daily Stock น้ำ / ขนม",
      "เพิ่มสินค้าใน StoreHub",
      "รับสินค้าเข้า",
      "นับ Stock / Stocktake",
      "ตรวจผลต่างและรายงาน"
    ]);
    assert.equal(stock?.checklist.some((item) => item.includes("Stock Take")), true);
    assert.equal(stock?.checklist.some((item) => item.includes("Completed")), true);
    assert.equal(stock?.checklist.some((item) => item.includes("น้ำ/ขนม")), true);
    assert.equal(stock?.checklist.some((item) => item.includes("StoreHub")), true);
    assert.equal(stock?.checklist.some((item) => item.includes("เติมสินค้าบนชั้น")), true);
    assert.deepEqual(daytime?.sections.map((section) => section.title), ["งานแพ็คและส่งของ"]);
    assert.deepEqual(stock?.checklist, [
      "ดึงข้อมูลการนับจาก StoreHub Stock Take และ approve เมื่อสถานะ Completed",
      "นับจำนวนจริงหน้าร้านและห้อง Stock",
      "สรุปรายวันสินค้าใกล้หมดจาก StoreHub Supply Needs เฉพาะชื่อและจำนวนที่เหลือ",
      "เติมสินค้าบนชั้น",
      "สรุปรายการน้ำ/ขนมที่ต้องสั่งเพิ่ม"
    ]);
    assert.deepEqual(daytime?.checklist, [
      "ตรวจสอบเช็คสินค้าที่ต้องจัดส่ง",
      "จำนวนออเดอร์ทั้งหมดที่ต้องส่ง",
      "แพ็คสินค้าตามขั้นตอน",
      "แจ้งเลข tracking กับลูกค้า"
    ]);
    assert.equal(daytime?.checklist.includes("ไม่มีออเดอร์"), false);
    assert.deepEqual(closing?.checklist, [
      "แพ็คออเดอร์ที่ค้าง",
      "เก็บอุปกรณ์ ทำความสะอาดพื้นที่เล่น",
      "ปิดยอดร้านและบันทึกเงินสด",
      "แจ้งสรุปประจำวันในกลุ่มแอดมิน",
      "ปิดระบบขาย / ปิดไฟ / ปิดแอร์",
      "ล็อกประตูและยืนยันปิดร้าน"
    ]);
    assert.equal(closing?.checklist.includes("ล็อกตู้สินค้าและตรวจสินค้าแพง"), false);
    assert.equal(closing?.checklist.includes("สรุปรายการต้องเติม"), false);
    assert.equal(closing?.checklist.includes("สรุปออเดอร์ก่อนกลับบ้าน"), false);
    assert.equal(cardStoreWorkflow[0].checklist.includes("ตอบแชทลูกค้า ค้างก่อน 12.00"), true);
  });

  it("links every task phase to its matching manual section", () => {
    assert.deepEqual(
      cardStoreWorkflow.map((phase) => [phase.title, workflowManualHref(phase.id)]),
      [
        ["เปิดร้าน", "/training#open-store"],
        ["Stock", "/training#stock-work"],
        ["จัดส่งสินค้า", "/training#daytime-work"],
        ["ปิดร้าน", "/training#close-store"]
      ]
    );
  });

  it("names stock work summary cards by actual stock count scope", () => {
    assert.deepEqual(stockWorkSummaryCards.map((card) => [card.kicker, card.title]), [
      ["01 Daily", "น้ำ ขนม"],
      ["02 Weekly", "อุปกรณ์, Sleeve"],
      ["03 Monthly", "single card"]
    ]);
  });
});

describe("phasesForShift (shift-aware routine)", () => {
  it("shift 1 sees เปิดร้าน + shared, not ปิดร้าน", () => {
    const ids = phasesForShift(cardStoreWorkflow, "s1").map((p) => p.id);
    assert.ok(ids.includes("open-store"));
    assert.ok(ids.includes("stock-work"));
    assert.ok(ids.includes("daytime-work"));
    assert.equal(ids.includes("close-store"), false);
  });

  it("shift 2 sees ปิดร้าน + shared, not เปิดร้าน", () => {
    const ids = phasesForShift(cardStoreWorkflow, "s2").map((p) => p.id);
    assert.ok(ids.includes("close-store"));
    assert.ok(ids.includes("stock-work"));
    assert.equal(ids.includes("open-store"), false);
  });
});

describe("daily checklist overrides", () => {
  it("replaces a phase checklist when overridden, leaves others", async () => {
    const { applyChecklistOverrides } = await import("../lib/daily-checklist.ts");
    const out = applyChecklistOverrides(cardStoreWorkflow, { "open-store": ["ข้อใหม่ 1", "ข้อใหม่ 2"] });
    const open = out.find((p) => p.id === "open-store");
    const stock = out.find((p) => p.id === "stock-work");
    assert.deepEqual(open?.checklist, ["ข้อใหม่ 1", "ข้อใหม่ 2"]);
    assert.deepEqual(stock?.checklist, cardStoreWorkflow.find((p) => p.id === "stock-work")?.checklist);
  });

  it("respects an explicit empty override", async () => {
    const { applyChecklistOverrides } = await import("../lib/daily-checklist.ts");
    const out = applyChecklistOverrides(cardStoreWorkflow, { "close-store": [] });
    assert.deepEqual(out.find((p) => p.id === "close-store")?.checklist, []);
  });
});
