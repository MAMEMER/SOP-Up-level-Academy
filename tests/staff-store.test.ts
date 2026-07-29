import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextEmployeeId, sanitizeStaffRecord, seedStaffRecords } from "../lib/staff-records.ts";
import { seedSopUsers } from "../lib/sop-users.ts";
import { seedEmployeeDirectory } from "../lib/employee-directory.ts";

describe("staff store seed", () => {
  it("turns the compiled-in lists into one record per sign-in account", () => {
    const records = seedStaffRecords();

    assert.equal(records.length, seedSopUsers.length);
    for (const record of records) {
      assert.equal(record.email, record.email.toLowerCase());
      assert.ok(record.active);
    }
  });

  it("marks roster members as onRoster and admins-only accounts as not", () => {
    const records = seedStaffRecords();
    const rosterEmails = new Set(
      seedEmployeeDirectory.filter((entry) => entry.email).map((entry) => entry.email!.toLowerCase())
    );

    for (const record of records) {
      assert.equal(record.onRoster, rosterEmails.has(record.email), record.email);
    }
  });

  it("carries the KPI fields across so a seeded roster keeps its code and employment type", () => {
    const boom = seedStaffRecords().find((record) => record.code === "Boom");

    assert.ok(boom);
    assert.equal(boom.employmentType, "full_time");
    assert.equal(boom.branch, "bangkae");
    assert.ok(boom.aliases.includes("boom"));
  });
});

describe("staff numbers", () => {
  it("starts at UP-001", () => {
    assert.equal(nextEmployeeId([]), "UP-001");
  });

  it("continues from the highest number already issued", () => {
    assert.equal(nextEmployeeId([{ employeeId: "UP-001" }, { employeeId: "UP-004" }]), "UP-005");
  });

  it("never reuses the number of someone who has left", () => {
    // UP-002 is absent because that person was removed — the next hire must not inherit it
    assert.equal(nextEmployeeId([{ employeeId: "UP-001" }, { employeeId: "UP-003" }]), "UP-004");
  });

  it("ignores records that have no number yet", () => {
    assert.equal(nextEmployeeId([{ employeeId: "UP-002" }, {}, { employeeId: "" }]), "UP-003");
  });

  it("keeps the number out of the record when none was given", () => {
    assert.equal(sanitizeStaffRecord({ email: "New@Gmail.com", name: "ใหม่" }).employeeId, "");
  });

  it("stores the number upper-cased so up-001 and UP-001 are the same reference", () => {
    assert.equal(sanitizeStaffRecord({ email: "a@b.com", employeeId: " up-007 " }).employeeId, "UP-007");
  });
});
