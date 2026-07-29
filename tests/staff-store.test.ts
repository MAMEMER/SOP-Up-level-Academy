import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { seedStaffRecords } from "../lib/staff-records.ts";
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
