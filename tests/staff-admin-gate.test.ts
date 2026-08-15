import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canManageStaffAccounts, isOwner, OWNER_EMAILS, STAFF_ADMIN_EMAILS } from "../lib/owner.ts";

// การเพิ่ม/ลบอีเมล = เปิดหรือปิดประตูเข้าระบบทั้งใบ จึงแคบกว่า owner อีกชั้น
describe("canManageStaffAccounts", () => {
  it("แก้รายชื่อได้เฉพาะแชมป์กับเคน", () => {
    assert.deepEqual(STAFF_ADMIN_EMAILS, ["champ.championest@gmail.com", "kittibhonlim@gmail.com"]);
    assert.equal(canManageStaffAccounts("champ.championest@gmail.com"), true);
    assert.equal(canManageStaffAccounts("kittibhonlim@gmail.com"), true);
  });

  it("เป็นเจ้าของอย่างเดียวยังไม่พอ — เนมแก้รายชื่อไม่ได้", () => {
    assert.equal(isOwner("namenrw@gmail.com"), true);
    assert.equal(canManageStaffAccounts("namenrw@gmail.com"), false);
  });

  it("พนักงานแก้ไม่ได้ และค่าว่างไม่ผ่าน", () => {
    for (const email of ["thanakornjoeblack@gmail.com", "boomboom08755@gmail.com", "", null, undefined]) {
      assert.equal(canManageStaffAccounts(email), false, String(email));
    }
  });

  it("ไม่สนตัวพิมพ์เล็กใหญ่และช่องว่างหัวท้าย", () => {
    assert.equal(canManageStaffAccounts("  Champ.Championest@Gmail.com "), true);
  });

  it("เจ้าของ = หุ้นส่วนสามคน (แชมป์ · เนม · เคน)", () => {
    assert.deepEqual(OWNER_EMAILS, [
      "champ.championest@gmail.com",
      "namenrw@gmail.com",
      "kittibhonlim@gmail.com",
    ]);
  });
});
