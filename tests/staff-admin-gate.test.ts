import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canManageStaffAccounts, isOwner, OWNER_EMAILS, STAFF_ADMIN_EMAILS } from "../lib/owner.ts";

// การเพิ่ม/ลบอีเมล = เปิดหรือปิดประตูเข้าระบบทั้งใบ จึงแคบกว่า owner อีกชั้น
describe("canManageStaffAccounts", () => {
  it("มีบัญชีเดียวที่แก้รายชื่อได้", () => {
    assert.deepEqual(STAFF_ADMIN_EMAILS, ["champ.championest@gmail.com"]);
    assert.equal(canManageStaffAccounts("champ.championest@gmail.com"), true);
  });

  it("เจ้าของคนอื่นก็แก้รายชื่อไม่ได้ — คนละชั้นกัน", () => {
    for (const owner of ["namenrw@gmail.com", "kittibhonlim@gmail.com"]) {
      assert.equal(isOwner(owner), true, owner);
      assert.equal(canManageStaffAccounts(owner), false, owner);
    }
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
