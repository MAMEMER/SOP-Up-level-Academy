import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildChecklistAuditRecord, checklistAuditRecordsToEvents } from "../lib/checklist-audit-records.ts";
import { calculateChecklistScore } from "../lib/performance-score.ts";

const entry = (over: Partial<Parameters<typeof buildChecklistAuditRecord>[0]> = {}, recordedAt = "2026-08-05T12:00:00.000Z") =>
  buildChecklistAuditRecord(
    {
      workDate: "2026-08-05",
      employeeName: "ICE",
      type: "false_record",
      count: 1,
      note: "ติ๊กว่าเช็ดตู้แล้ว แต่ยังไม่ได้เช็ด",
      recordedBy: "champ.championest@gmail.com",
      ...over
    },
    recordedAt
  );

const eventsFor = (employeeName: string, records: ReturnType<typeof entry>[]) =>
  checklistAuditRecordsToEvents(records)
    .filter((item) => item.employeeName === employeeName)
    .map((item) => item.event);

describe("admin-entered checklist audits", () => {
  it("charges 10 and flags coaching for a false record", () => {
    const result = calculateChecklistScore(eventsFor("ICE", [entry()]));

    assert.equal(result.score, 10);
    assert.equal(result.deductions[0].reason, "false_record");
    assert.ok(result.flags.includes("coaching_required"));
  });

  it("charges 2 per missed important item and does not flag coaching", () => {
    const result = calculateChecklistScore(eventsFor("ICE", [entry({ type: "missing_important", count: 3 })]));

    assert.equal(result.score, 14);
    assert.equal(result.flags.length, 0);
  });

  it("sums same-type audits of one employee into a single event", () => {
    const events = eventsFor("ICE", [entry(), entry({}, "2026-08-05T13:00:00.000Z")]);

    assert.equal(events.length, 1);
    assert.equal(events[0].count, 2);
    assert.equal(calculateChecklistScore(events).score, 0);
  });

  it("keeps each employee's audits separate", () => {
    const records = [entry(), entry({ employeeName: "BOOM" })];

    assert.equal(calculateChecklistScore(eventsFor("BOOM", records)).score, 10);
    assert.equal(eventsFor("BOOM", records).length, 1);
  });

  it("counts a missing count as one, not zero", () => {
    const events = eventsFor("ICE", [entry({ count: 0 })]);

    assert.equal(events[0].count, 1);
  });

  it("stacks on top of the derived missing_day events", () => {
    const result = calculateChecklistScore([
      { type: "missing_day", count: 1, dates: ["2026-08-04"], source: "google-sheet" },
      ...eventsFor("ICE", [entry()])
    ]);

    assert.equal(result.score, 0);
    assert.equal(result.deductions.length, 2);
  });
});
