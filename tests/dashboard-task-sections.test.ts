import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("dashboard task sections UI", () => {
  it("does not show redundant header action buttons for daily and stock sections", () => {
    const source = readFileSync(new URL("../components/DashboardTaskSections.tsx", import.meta.url), "utf8");

    assert.equal(source.includes(">เปิด Checklist<"), false);
    assert.equal(source.includes(">เปิด Stock<"), false);
  });

  it("links assigned work dashboard cards to the staff submission page", () => {
    const source = readFileSync(new URL("../components/DashboardTaskSections.tsx", import.meta.url), "utf8");
    const pageSource = readFileSync(new URL("../app/(dashboard)/assigned-work/[recordId]/page.tsx", import.meta.url), "utf8");

    assert.equal(source.includes("/assigned-work/"), true);
    assert.equal(pageSource.includes("ส่งงานและหลักฐาน"), true);
    assert.equal(pageSource.includes("name=\"assignedEvidence\""), true);
    assert.equal(pageSource.includes("updateAssignedWorkRecordSubmission"), true);
  });

  it("requires StoreHub Stock Take Completed status before stock submission", () => {
    const source = readFileSync(new URL("../components/WorkflowChecklist.tsx", import.meta.url), "utf8");

    assert.equal(source.includes("stocktake-status"), true);
    assert.equal(source.includes("Completed"), true);
    assert.equal(source.includes("missingStockTakeApproval"), true);
    assert.equal(source.includes("StoreHub Stock Take ต้องเป็น Completed ก่อนส่งงาน Stock"), true);
  });

  it("links the stock room count box to the Google Sheet tracker", () => {
    const source = readFileSync(new URL("../components/WorkflowChecklist.tsx", import.meta.url), "utf8");

    assert.equal(source.includes("stockRoomSheetUrl"), true);
    assert.equal(source.includes("https://docs.google.com/spreadsheets/d/1hZcCPfbjEsKTVnLxSrb75HnPdv8ZcGQyvaB5BEa5Vyk/edit?gid=0#gid=0"), true);
    assert.equal(source.includes("เปิด Google Sheet ห้อง Stock"), true);
  });

  it("summarizes low stock daily from StoreHub Supply Needs with only name and remaining quantity", () => {
    const source = readFileSync(new URL("../components/WorkflowChecklist.tsx", import.meta.url), "utf8");

    assert.equal(source.includes("supplyNeedsUrl"), true);
    assert.equal(source.includes("https://uplevel.storehubhq.com/stocks/supplyNeeds/v2/web"), true);
    assert.equal(source.includes("สรุปรายวันจาก StoreHub Supply Needs"), true);
    assert.equal(source.includes("ชื่อสินค้า | จำนวนที่เหลือ"), true);
  });

  it("does not explain orange late-submit behavior in the checklist window text", () => {
    const source = readFileSync(new URL("../components/WorkflowChecklist.tsx", import.meta.url), "utf8");

    assert.equal(source.includes("เลยเวลาแล้ว ถ้าส่งงานจะขึ้นสีส้ม"), false);
  });

  it("shows shipping order summary channels on the first shipping checklist item", () => {
    const source = readFileSync(new URL("../components/WorkflowChecklist.tsx", import.meta.url), "utf8");

    assert.equal(source.includes("ShippingTaskDetails"), true);
    assert.equal(source.includes("ช่องทางออเดอร์"), true);
    assert.equal(source.includes("Facebook"), true);
    assert.equal(source.includes("IG"), true);
    assert.equal(source.includes("Line group"), true);
    assert.equal(source.includes("Shopee"), true);
    assert.equal(source.includes("ไม่มีออเดอร์"), true);
  });

  it("records tracking on the shipping packing step", () => {
    const source = readFileSync(new URL("../components/WorkflowChecklist.tsx", import.meta.url), "utf8");

    assert.equal(source.includes("แพ็คสินค้าตามขั้นตอน"), true);
    assert.equal(source.includes("จัดส่งสินค้าพร้อมเพิ่ม record เลข track"), true);
    assert.equal(source.includes("shipping-tracking-number"), true);
  });

  it("removes the checklist Done status box but keeps progress visible", () => {
    const source = readFileSync(new URL("../components/WorkflowChecklist.tsx", import.meta.url), "utf8");

    assert.equal(source.includes("<span>Done</span>"), false);
    assert.equal(source.includes("ความคืบหน้าทั้งวัน"), true);
    assert.equal(source.includes("runner-progress"), true);
  });

  it("captures shelf refill evidence and product groups", () => {
    const source = readFileSync(new URL("../components/WorkflowChecklist.tsx", import.meta.url), "utf8");

    assert.equal(source.includes("stock-shelf-refill-photo"), true);
    assert.equal(source.includes("น้ำ,ขนม"), true);
    assert.equal(source.includes("ชั้นแขวน อุปกรณ์"), true);
    assert.equal(source.includes("การ์ด Booster box"), true);
  });

  it("captures total shipping order count before packing", () => {
    const source = readFileSync(new URL("../components/WorkflowChecklist.tsx", import.meta.url), "utf8");

    assert.equal(source.includes("shipping-total-order-count"), true);
    assert.equal(source.includes("จำนวนออเดอร์ทั้งหมดที่ต้องส่ง"), true);
  });

  it("removes close-store phase helper text and adds closing proof fields", () => {
    const source = readFileSync(new URL("../components/WorkflowChecklist.tsx", import.meta.url), "utf8");

    assert.equal(source.includes("ต้องทำขั้นก่อนหน้าให้เสร็จก่อน"), false);
    assert.equal(source.includes("admin แก้ไขได้"), false);
    assert.equal(source.includes("closing-order-count"), true);
    assert.equal(source.includes("แจ้งในกลุ่มแอดมินเพื่อส่งของในวันพรุ่งนี้"), true);
    assert.equal(source.includes("อัปโหลดรูปแพ็คออเดอร์ที่ค้าง"), true);
    assert.equal(source.includes("อัปโหลดรูปหลักฐานทำความสะอาด"), true);
    assert.equal(source.includes("แจ้งสรุปประจำวันในกลุ่มแอดมิน"), true);
  });
});
