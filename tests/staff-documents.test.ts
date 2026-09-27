import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SHEET_HEADERS,
  canRetryDrive,
  daysUntilDeadline,
  deadlineText,
  docsStatus,
  driveFileName,
  filesSatisfied,
  formFromSheetRow,
  isDocsEligible,
  isValidThaiId,
  mergeDraft,
  normalizeForm,
  notifyMessage,
  prefillForm,
  resolveMimeType,
  sheetRowFor,
  shouldShowDocsBanner,
  staffDocFormSchema,
  validateStaffDocForm,
  type StaffDocForm,
  type StaffDocRecord
} from "../lib/staff-documents.ts";

function withCheckDigit(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(first12[i]) * (13 - i);
  return `${first12}${(11 - (sum % 11)) % 10}`;
}

const VALID_ID = withCheckDigit("110370000000");
const TODAY = "2026-09-27";
const BOTH_FILES = { idCard: true, bankBook: true };

function completeForm(overrides: Partial<StaffDocForm> = {}): StaffDocForm {
  return {
    ...prefillForm({ email: "staff@example.com", employmentType: "part_time" }),
    title: "นาย",
    firstNameTh: "ทดสอบ",
    lastNameTh: "ระบบ",
    firstNameEn: "Test",
    lastNameEn: "System",
    nationalId: VALID_ID,
    birthDate: "2000-05-01",
    maritalStatus: "โสด",
    phone: "0812345678",
    address: "99/9 ถนนทดสอบ แขวงบางแค เขตบางแค กรุงเทพฯ 10160",
    startDate: "2026-06-01",
    priorInsured: "ไม่เคย",
    multiEmployer: "ไม่",
    hospitalChoice: "เลือกสถานพยาบาลใหม่",
    hospital1: "โรงพยาบาลทดสอบ",
    bank: "กสิกรไทย",
    bankAccount: "1234567890",
    bankAccountName: "นายทดสอบ ระบบ",
    ...overrides
  };
}

describe("isValidThaiId", () => {
  it("accepts a correct check digit and rejects a typo", () => {
    assert.equal(isValidThaiId(VALID_ID), true);
    const typo = VALID_ID.slice(0, 12) + String((Number(VALID_ID[12]) + 1) % 10);
    assert.equal(isValidThaiId(typo), false);
    assert.equal(isValidThaiId("123"), false);
  });
  it("ignores dashes and spaces", () => {
    const dashed = `${VALID_ID[0]}-${VALID_ID.slice(1, 5)}-${VALID_ID.slice(5, 10)}-${VALID_ID.slice(10, 12)}-${VALID_ID[12]}`;
    assert.equal(isValidThaiId(dashed), true);
  });
});

describe("validateStaffDocForm", () => {
  it("a complete form with both files has no issues", () => {
    assert.deepEqual(validateStaffDocForm(completeForm(), { today: TODAY, files: BOTH_FILES }), []);
  });

  it("the prefilled blank form lists every required field plus both files", () => {
    const issues = validateStaffDocForm(prefillForm({}), { today: TODAY, files: {} });
    const keys = issues.map((issue) => issue.key);
    for (const key of ["title", "firstNameTh", "nationalId", "birthDate", "address", "phone", "startDate", "bank", "bankAccount", "idCard", "bankBook"]) {
      assert.ok(keys.includes(key as never), `missing ${key}`);
    }
    // prefilled defaults are not reported
    assert.ok(!keys.includes("nationality"));
    assert.ok(!keys.includes("personType"));
  });

  it("blocks submit until BOTH required files are attached", () => {
    const onlyId = validateStaffDocForm(completeForm(), { today: TODAY, files: { idCard: true } });
    assert.deepEqual(onlyId.map((issue) => issue.key), ["bankBook"]);
  });

  it("files already on Drive satisfy the requirement on re-submit", () => {
    const files = filesSatisfied({}, ["idCard", "bankBook"]);
    assert.deepEqual(validateStaffDocForm(completeForm(), { today: TODAY, files }), []);
  });

  it("rejects an invalid ID, except 0000000000000 for a TEST- employee", () => {
    const form = completeForm({ nationalId: "0000000000000" });
    assert.equal(validateStaffDocForm(form, { today: TODAY, files: BOTH_FILES, employeeId: "UP-003" })[0]?.key, "nationalId");
    assert.deepEqual(validateStaffDocForm(form, { today: TODAY, files: BOTH_FILES, employeeId: "TEST-01" }), []);
  });

  it("names must be in the right script", () => {
    const issues = validateStaffDocForm(completeForm({ firstNameTh: "Test", firstNameEn: "ทดสอบ" }), { today: TODAY, files: BOTH_FILES });
    assert.deepEqual(issues.map((issue) => issue.key), ["firstNameTh", "firstNameEn"]);
  });

  it("child birth years are required only up to the child count", () => {
    const one = validateStaffDocForm(completeForm({ childrenUnder6: "1" }), { today: TODAY, files: BOTH_FILES });
    assert.deepEqual(one.map((issue) => issue.key), ["childBirthYear1"]);
    const ok = validateStaffDocForm(completeForm({ childrenUnder6: "1", childBirthYear1: "2566" }), { today: TODAY, files: BOTH_FILES });
    assert.deepEqual(ok, []);
  });

  it("conditional fields: disability, other employer, other bank, hospital ranking", () => {
    const issues = validateStaffDocForm(
      completeForm({ bodyStatus: "พิการ", multiEmployer: "ใช่", bank: "อื่น ๆ", hospitalChoice: "ขอเปลี่ยนสถานพยาบาล", hospital1: "" }),
      { today: TODAY, files: BOTH_FILES }
    );
    assert.deepEqual(issues.map((issue) => issue.key).sort(), ["bankOther", "currentHospital", "disability", "hospital1", "otherEmployer"].sort());
  });

  it("does not require a hospital ranking when keeping the current one", () => {
    const issues = validateStaffDocForm(completeForm({ hospitalChoice: "ไม่เปลี่ยนแปลง", hospital1: "", currentHospital: "รพ.เดิม" }), {
      today: TODAY,
      files: BOTH_FILES
    });
    assert.deepEqual(issues, []);
  });

  it("rejects implausible dates and bad phone / account numbers", () => {
    const issues = validateStaffDocForm(
      completeForm({ birthDate: "2020-01-01", startDate: "2031-01-01", phone: "12345", bankAccount: "12" }),
      { today: TODAY, files: BOTH_FILES }
    );
    assert.deepEqual(issues.map((issue) => issue.key), ["birthDate", "phone", "startDate", "bankAccount"]);
  });

  it("only accepts listed options for dropdown fields", () => {
    const issues = validateStaffDocForm(completeForm({ title: "Mr", bank: "Bank X" }), { today: TODAY, files: BOTH_FILES });
    assert.deepEqual(issues.map((issue) => issue.key), ["title", "bank"]);
  });
});

describe("staffDocFormSchema", () => {
  it("drops unknown keys and fills missing ones with empty strings", () => {
    const parsed = staffDocFormSchema.parse({ title: "นาย", salary: 99999, isAdmin: true });
    assert.equal(parsed.title, "นาย");
    assert.equal(parsed.bankAccount, "");
    assert.equal("salary" in parsed, false);
    assert.equal("isAdmin" in parsed, false);
  });
  it("rejects non-string values and very long strings", () => {
    assert.equal(staffDocFormSchema.safeParse({ title: 5 }).success, false);
    assert.equal(staffDocFormSchema.safeParse({ note: "x".repeat(301) }).success, false);
  });
});

describe("normalizeForm + mergeDraft", () => {
  it("strips formatting and clears fields that no longer apply", () => {
    const form = normalizeForm(
      completeForm({ nationalId: ` ${VALID_ID.slice(0, 1)}-${VALID_ID.slice(1)} `, phone: "081-234-5678", childrenUnder6: "0", childBirthYear1: "2566", disability: "x" })
    );
    assert.equal(form.nationalId, VALID_ID);
    assert.equal(form.phone, "0812345678");
    assert.equal(form.childBirthYear1, "");
    assert.equal(form.disability, "");
  });
  it("mergeDraft keeps only known string keys", () => {
    const merged = mergeDraft(prefillForm({}), { title: "นาง", phone: 123, evil: "x" });
    assert.equal(merged.title, "นาง");
    assert.equal(merged.phone, "");
    assert.equal("evil" in merged, false);
  });
  it("prefill maps employment type", () => {
    assert.equal(prefillForm({ employmentType: "full_time" }).employmentKind, "รายเดือน");
    assert.equal(prefillForm({ employmentType: "part_time" }).employmentKind, "รายวัน");
  });
});

describe("eligibility + status", () => {
  const employee = { role: "employee", active: true, employeeId: "UP-003" };
  const owner = { role: "admin", active: true, employeeId: "UP-001" };

  it("only active employees must fill it — owners/admins never", () => {
    assert.equal(isDocsEligible(employee), true);
    assert.equal(isDocsEligible(owner), false);
    assert.equal(isDocsEligible({ ...employee, active: false }), false);
    assert.equal(isDocsEligible(null), false);
  });

  it("banner shows until the employee submits, even while Drive is failing it stays hidden", () => {
    assert.equal(shouldShowDocsBanner(employee, null), true);
    assert.equal(shouldShowDocsBanner(employee, { status: "pending_drive" }), false);
    assert.equal(shouldShowDocsBanner(employee, { status: "drive_failed" }), false);
    assert.equal(shouldShowDocsBanner(employee, { status: "on_drive" }), false);
    assert.equal(shouldShowDocsBanner(owner, null), false);
  });

  it("docsStatus + canRetryDrive", () => {
    assert.equal(docsStatus(null), "not_submitted");
    const base = { employeeId: "UP-003", status: "drive_failed" } as StaffDocRecord;
    assert.equal(canRetryDrive({ ...base, pending: { submissionId: "s", form: prefillForm({}), files: [] } }), true);
    assert.equal(canRetryDrive({ ...base, status: "on_drive" }), false);
    assert.equal(canRetryDrive({ ...base }), false);
  });

  it("deadline countdown", () => {
    assert.equal(daysUntilDeadline("2026-09-27"), 3);
    assert.match(deadlineText("2026-09-27"), /เหลือ 3 วัน/);
    assert.match(deadlineText("2026-09-30"), /วันนี้/);
    assert.match(deadlineText("2026-10-02"), /เลยกำหนด/);
  });
});

describe("files + sheet", () => {
  it("resolves HEIC with an empty browser type from the extension", () => {
    assert.equal(resolveMimeType("IMG_0001.HEIC", ""), "image/heic");
    assert.equal(resolveMimeType("scan.pdf", "application/pdf"), "application/pdf");
    assert.equal(resolveMimeType("virus.exe", "application/x-msdownload"), null);
    assert.equal(resolveMimeType("page.html", "text/html"), null);
  });

  it("drive file names follow <code>_<nickname>_<kind>", () => {
    assert.equal(driveFileName("UP-003", "บูม", "idCard", "image/jpeg"), "UP-003_บูม_บัตรประชาชน.jpg");
    assert.equal(driveFileName("UP-003", "บูม", "bankBook", "application/pdf"), "UP-003_บูม_สมุดบัญชี.pdf");
    assert.equal(driveFileName("UP-003", "บูม", "other", "image/png", 1), "UP-003_บูม_เอกสารอื่น-2.png");
  });

  it("sheet row matches the accountant template column order and leaves owner columns untouched", () => {
    const row = sheetRowFor(completeForm(), { employeeId: "UP-003", nickname: "บูม", branchLabel: "บางแค", submittedAtLabel: "x", submitCount: 1 });
    assert.equal(row.length, SHEET_HEADERS.length);
    const at = (header: string) => row[SHEET_HEADERS.indexOf(header as (typeof SHEET_HEADERS)[number])];
    assert.equal(at("รหัสพนักงาน"), "UP-003");
    assert.equal(at("เลขบัตรประชาชน"), VALID_ID);
    assert.equal(at("ธนาคาร"), "กสิกรไทย");
    assert.equal(at("สาขา / สถานที่ทำงาน"), "บางแค");
    // owner/accountant-only columns are null so a re-submit never overwrites them
    for (const header of ["ลำดับ", "ตำแหน่ง", "แผนก", "เงินเดือน / ค่าจ้างต่อเดือน", "ขึ้นทะเบียนประกันสังคม"]) assert.equal(at(header), null);
    assert.equal(SHEET_HEADERS[39], "หมายเหตุ Payroll / HR"); // column AN, same as the template
  });

  it("formFromSheetRow round-trips what sheetRowFor wrote", () => {
    const form = normalizeForm(completeForm({ bank: "อื่น ๆ", bankOther: "ธนาคารแลนด์" }));
    const row = sheetRowFor(form, { employeeId: "UP-003", nickname: "บูม", branchLabel: "บางแค", submittedAtLabel: "x", submitCount: 1 });
    const back = formFromSheetRow(row);
    for (const key of ["title", "firstNameTh", "nationalId", "birthDate", "phone", "address", "bankAccount", "hospital1", "bankOther"] as const) {
      assert.equal(back[key], form[key], key);
    }
    assert.equal(back.bank, "อื่น ๆ");
  });

  it("notification is plain text with no personal data", () => {
    const message = notifyMessage({ nickname: "บูม", employeeId: "UP-003", submitCount: 1, test: true });
    assert.equal(message, "TEST - เอกสารพนักงาน: บูม (UP-003) ส่งเอกสารแล้ว");
    assert.doesNotMatch(message, /[[\]*_]/);
    assert.match(notifyMessage({ nickname: "บูม", employeeId: "UP-003", submitCount: 2, test: false }), /แก้ไขครั้งที่ 2/);
  });
});

describe("driveErrorText", () => {
  it("explains the common failures in Thai", async () => {
    const { driveErrorText } = await import("../lib/staff-documents.ts");
    assert.match(driveErrorText("bad_response_403"), /authorize/);
    assert.match(driveErrorText("drive_bridge_not_configured"), /STAFF_DOCS_GAS_URL/);
    assert.equal(driveErrorText(undefined), "");
    assert.equal(driveErrorText("something_else"), "something_else");
  });
});
