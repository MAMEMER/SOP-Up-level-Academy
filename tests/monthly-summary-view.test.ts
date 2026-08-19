import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterReviewRecords,
  formatThaiDayLabel,
  groupRecordsByStaff,
  isReviewableRecord,
  reviewableDates,
  reviewablePhaseTypes,
  summariseReviewRecords,
  type NamedWorkflowRecord
} from "../lib/monthly-summary-view.ts";

function record(overrides: Partial<NamedWorkflowRecord>): NamedWorkflowRecord {
  return {
    workDate: "2026-08-19",
    phaseId: "open-store",
    phaseTitle: "เปิดร้าน",
    completed: 5,
    total: 5,
    status: "submitted",
    recordedAt: "2026-08-19T06:00:00Z",
    startedAt: "2026-08-19T06:00:00Z",
    submittedAt: "2026-08-19T06:20:00Z",
    dueAt: "2026-08-19T06:30:00Z",
    employeeName: "สมชาย",
    employeeEmail: "somchai@example.com",
    ...overrides
  };
}

describe("monthly summary view", () => {
  it("keeps only submitted / missed records reviewable", () => {
    assert.equal(isReviewableRecord(record({ status: "submitted" })), true);
    assert.equal(isReviewableRecord(record({ status: "missed" })), true);
    assert.equal(isReviewableRecord(record({ status: "saved" })), false);
  });

  it("lists reviewable dates newest first, within the month", () => {
    const records = [
      record({ workDate: "2026-08-01" }),
      record({ workDate: "2026-08-19" }),
      record({ workDate: "2026-08-10", status: "saved" }),
      record({ workDate: "2026-07-31" })
    ];
    assert.deepEqual(reviewableDates(records, "2026-08"), ["2026-08-19", "2026-08-01"]);
  });

  it("lists distinct work types by phaseId", () => {
    const records = [
      record({ phaseId: "open-store", phaseTitle: "เปิดร้าน" }),
      record({ phaseId: "close-store", phaseTitle: "ปิดร้าน" }),
      record({ phaseId: "open-store", phaseTitle: "เปิดร้าน" })
    ];
    const types = reviewablePhaseTypes(records, "2026-08");
    assert.equal(types.length, 2);
    assert.ok(types.some((type) => type.phaseId === "open-store"));
    assert.ok(types.some((type) => type.phaseId === "close-store"));
  });

  it("filters by a single day and work type", () => {
    const records = [
      record({ workDate: "2026-08-19", phaseId: "open-store" }),
      record({ workDate: "2026-08-19", phaseId: "close-store" }),
      record({ workDate: "2026-08-18", phaseId: "open-store" })
    ];
    const day = filterReviewRecords(records, { datePrefix: "2026-08-19", phaseId: "all" });
    assert.equal(day.length, 2);
    const dayType = filterReviewRecords(records, { datePrefix: "2026-08-19", phaseId: "open-store" });
    assert.equal(dayType.length, 1);
    assert.equal(dayType[0].phaseId, "open-store");
  });

  it("filters the whole month with a month prefix", () => {
    const records = [record({ workDate: "2026-08-01" }), record({ workDate: "2026-08-19" })];
    assert.equal(filterReviewRecords(records, { datePrefix: "2026-08", phaseId: "all" }).length, 2);
  });

  it("groups records by staff and counts submitted / missed", () => {
    const records = [
      record({ employeeEmail: "a@x.com", employeeName: "เอ", status: "submitted" }),
      record({ employeeEmail: "a@x.com", employeeName: "เอ", status: "missed", phaseId: "close-store" }),
      record({ employeeEmail: "b@x.com", employeeName: "บี", status: "submitted" })
    ];
    const groups = groupRecordsByStaff(records);
    assert.equal(groups.length, 2);
    const a = groups.find((group) => group.employeeEmail === "a@x.com");
    assert.ok(a);
    assert.equal(a.submitted, 1);
    assert.equal(a.missed, 1);
    assert.equal(a.records.length, 2);
  });

  it("summarises counts, rate and on-time from the filtered slice", () => {
    const records = [
      record({ completed: 5, total: 5, submittedAt: "2026-08-19T06:20:00Z", dueAt: "2026-08-19T06:30:00Z" }),
      record({ completed: 3, total: 5, submittedAt: "2026-08-19T07:00:00Z", dueAt: "2026-08-19T06:30:00Z" }),
      record({ status: "missed" })
    ];
    const summary = summariseReviewRecords(records);
    assert.equal(summary.submittedRecords, 2);
    assert.equal(summary.completedRecords, 1);
    assert.equal(summary.completionRate, 50);
    assert.equal(summary.onTimeRecords, 1);
    assert.equal(summary.totalChecklist, 10);
    assert.equal(summary.completedChecklist, 8);
  });

  it("formats a Thai day label without timezone drift", () => {
    assert.equal(formatThaiDayLabel("2026-08-19"), "19 ส.ค. 69");
    assert.equal(formatThaiDayLabel("2026-01-01"), "1 ม.ค. 69");
  });
});
