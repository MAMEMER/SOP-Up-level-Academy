import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sopFormSchema } from "../lib/validations.ts";

describe("SOP form validation", () => {
  it("accepts a complete SOP form", () => {
    const result = sopFormSchema.safeParse({
      title: "เปิดร้านประจำวัน",
      departmentId: "department-id",
      categoryId: "category-id",
      purpose: "ให้พนักงานเปิดร้านได้ตามมาตรฐาน",
      whenToUse: "ใช้ก่อนเปิดร้านทุกวัน",
      responsibleRole: "พนักงานหน้าร้าน",
      requiredTools: "กุญแจร้าน, checklist",
      precautions: "ตรวจประตูและระบบไฟ",
      faq: "ถ้ากุญแจหายให้แจ้งหัวหน้า",
      tags: ["เปิดร้าน"],
      steps: [{ title: "เปิดประตู", body: "ใช้กุญแจหลักเปิดประตู", checklistItems: ["ตรวจล็อก"] }]
    });

    assert.equal(result.success, true);
  });

  it("rejects a SOP without title", () => {
    const result = sopFormSchema.safeParse({
      title: "",
      departmentId: "department-id",
      categoryId: "category-id",
      purpose: "purpose",
      whenToUse: "when",
      responsibleRole: "role",
      requiredTools: "tools",
      precautions: "precautions",
      faq: "faq",
      tags: [],
      steps: []
    });

    assert.equal(result.success, false);
  });
});
