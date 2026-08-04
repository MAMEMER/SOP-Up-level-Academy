import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canEditWorkflowRecord,
  canAdminUnlockWorkflowRecord,
  formatWorkDate,
  isPhaseDayClosed,
  isPhaseNotYetOpen,
  isPhaseSubmittable,
  isPhaseUnlocked,
  isPhasePastDue,
  isWithinWorkflowWorkHours,
  isWorkflowRecordOnTime,
  mergeDayMaps,
  phaseScheduleForWorkDate,
  recordsFromDayPayloads,
  shouldAutoMissWorkflowRecord,
  summarizeMonthlyRecords,
  upsertWorkflowRecord,
  workflowVisualStatus,
  type WorkflowDailyRecord
} from "../lib/workflow-records.ts";

describe("workflow daily records", () => {
  it("formats a stable work date key", () => {
    assert.equal(formatWorkDate(new Date("2026-07-04T08:30:00Z")), "2026-07-04");
  });

  it("saves and then submits a phase record for manager review", () => {
    const records: WorkflowDailyRecord[] = [];
    const saved = upsertWorkflowRecord(records, {
      workDate: "2026-07-04",
      phaseId: "open-store",
      phaseTitle: "เปิดร้าน",
      completed: 3,
      total: 7,
      status: "saved",
      recordedAt: "2026-07-04T09:00:00Z"
    });
    const submitted = upsertWorkflowRecord(saved, {
      workDate: "2026-07-04",
      phaseId: "open-store",
      phaseTitle: "เปิดร้าน",
      completed: 7,
      total: 7,
      status: "submitted",
      recordedAt: "2026-07-04T09:20:00Z"
    });

    assert.equal(submitted.length, 1);
    assert.equal(submitted[0].status, "submitted");
    assert.equal(submitted[0].completed, 7);
  });

  it("allows editing saved records but locks submitted records", () => {
    assert.equal(canEditWorkflowRecord(undefined), true);
    assert.equal(canEditWorkflowRecord({ status: "saved" } as WorkflowDailyRecord), true);
    assert.equal(canEditWorkflowRecord({ status: "submitted" } as WorkflowDailyRecord), false);
    assert.equal(canEditWorkflowRecord({ status: "missed" } as WorkflowDailyRecord), false);
    assert.equal(canEditWorkflowRecord({ status: "submitted" } as WorkflowDailyRecord, { adminOverride: true }), true);
    assert.equal(canEditWorkflowRecord({ status: "missed" } as WorkflowDailyRecord, { adminOverride: true }), true);
  });

  it("flattens per-day documents into one record list", () => {
    const merged = recordsFromDayPayloads([
      { records: [{ workDate: "2026-07-04", phaseId: "close-store", phaseTitle: "ปิดร้าน", completed: 5, total: 5, status: "submitted", recordedAt: "x" }] },
      undefined,
      { records: [{ workDate: "2026-07-03", phaseId: "open-store", phaseTitle: "เปิดร้าน", completed: 7, total: 7, status: "submitted", recordedAt: "x" }] }
    ]);

    assert.deepEqual(merged.map((record) => `${record.workDate}:${record.phaseId}`), [
      "2026-07-03:open-store",
      "2026-07-04:close-store"
    ]);
  });

  it("merges date-scoped note and detail maps across days", () => {
    assert.deepEqual(mergeDayMaps([{ "2026-07-03:a": "old" }, undefined, { "2026-07-04:a": "new" }]), {
      "2026-07-03:a": "old",
      "2026-07-04:a": "new"
    });
  });

  it("lets admins unlock missed records without letting staff edit them", () => {
    const missedRecord = {
      workDate: "2026-07-04",
      phaseId: "open-store",
      phaseTitle: "เปิดร้าน",
      completed: 0,
      total: 7,
      status: "missed",
      recordedAt: "2026-07-04T02:31:00.000Z"
    } satisfies WorkflowDailyRecord;

    assert.equal(canAdminUnlockWorkflowRecord(missedRecord, "open-store", "2026-07-04"), true);
    assert.equal(canEditWorkflowRecord(missedRecord), false);

    const unlockedRecord = {
      ...missedRecord,
      status: "saved",
      adminUnlockedAt: "2026-07-04T02:40:00.000Z",
      adminUnlockedBy: "admin@uplevel.academy"
    } satisfies WorkflowDailyRecord;

    assert.equal(canEditWorkflowRecord(unlockedRecord), false);
    assert.equal(canEditWorkflowRecord(unlockedRecord, { adminOverride: true }), true);
    assert.equal(shouldAutoMissWorkflowRecord(unlockedRecord, "open-store", "2026-07-04", new Date("2026-07-04T02:45:00.000Z")), false);
  });

  it("summarizes submitted records for a monthly monitor", () => {
    const summary = summarizeMonthlyRecords(
      [
        {
          workDate: "2026-07-04",
          phaseId: "open-store",
          phaseTitle: "เปิดร้าน",
          completed: 7,
          total: 7,
          status: "submitted",
          recordedAt: "2026-07-04T09:00:00Z"
        },
        {
          workDate: "2026-07-05",
          phaseId: "close-store",
          phaseTitle: "ปิดร้าน",
          completed: 6,
          total: 8,
          status: "saved",
          recordedAt: "2026-07-05T20:00:00Z"
        }
      ],
      "2026-07"
    );

    assert.equal(summary.submittedRecords, 1);
    assert.equal(summary.completedRecords, 1);
    assert.equal(summary.completionRate, 100);
  });

  it("gives every หัวข้อ its own clock deadline instead of a store-hours window", () => {
    // 2026-07-06 is a Monday. Deadlines are absolute Bangkok times, same for both shifts.
    const open = phaseScheduleForWorkDate("open-store", "2026-07-06");
    const stock = phaseScheduleForWorkDate("stock-work", "2026-07-06");
    const close = phaseScheduleForWorkDate("close-store", "2026-07-06");

    assert.equal(open.dueLabel, "12:00");
    assert.equal(stock.dueLabel, "18:00");
    assert.equal(close.dueLabel, "23:59");
    // ปิดร้าน is the one phase with a start lock: it cannot be handed in before 19:00.
    assert.equal(close.hasOpenTime, true);
    assert.equal(close.startLabel, "19:00");
    assert.equal(open.hasOpenTime, false);

    // 12:00 Bangkok = 05:00 UTC
    assert.equal(isPhasePastDue("open-store", "2026-07-06", new Date("2026-07-06T04:59:00.000Z")), false);
    assert.equal(isPhasePastDue("open-store", "2026-07-06", new Date("2026-07-06T05:01:00.000Z")), true);
  });

  it("locks ปิดร้าน until 19:00 and closes every หัวข้อ at 23:59", () => {
    const beforeSeven = new Date("2026-07-06T11:00:00.000Z"); // 18:00 Bangkok
    const afterSeven = new Date("2026-07-06T12:30:00.000Z"); // 19:30 Bangkok
    const nextDay = new Date("2026-07-07T00:30:00.000Z"); // 07:30 Bangkok, วันถัดไป

    assert.equal(isPhaseNotYetOpen("close-store", "2026-07-06", beforeSeven), true);
    assert.equal(isPhaseSubmittable("close-store", "2026-07-06", beforeSeven), false);
    assert.equal(isPhaseNotYetOpen("close-store", "2026-07-06", afterSeven), false);
    assert.equal(isPhaseSubmittable("close-store", "2026-07-06", afterSeven), true);

    // เปิดร้าน has no start lock, so it is submittable from the start of the day
    assert.equal(isPhaseNotYetOpen("open-store", "2026-07-06", beforeSeven), false);

    assert.equal(isPhaseDayClosed("close-store", "2026-07-06", nextDay), true);
    assert.equal(isPhaseSubmittable("close-store", "2026-07-06", nextDay), false);
  });

  it("keeps a phase past its deadline open until the day ends, then misses it", () => {
    const late = new Date("2026-07-06T06:00:00.000Z"); // 13:00 Bangkok, เปิดร้าน due 12:00
    const nextDay = new Date("2026-07-07T00:30:00.000Z");

    // Late is a 2-point deduction, not a lost phase — it must stay submittable.
    assert.equal(isPhasePastDue("open-store", "2026-07-06", late), true);
    assert.equal(isPhaseSubmittable("open-store", "2026-07-06", late), true);
    assert.equal(shouldAutoMissWorkflowRecord(undefined, "open-store", "2026-07-06", late), false);
    assert.equal(workflowVisualStatus([], "2026-07-06", "open-store", late), "orange");

    assert.equal(shouldAutoMissWorkflowRecord(undefined, "open-store", "2026-07-06", nextDay), true);
    assert.equal(workflowVisualStatus([], "2026-07-06", "open-store", nextDay), "red");
  });

  it("uses the owner's configured window when there is one", () => {
    const windows = { "stock-work": { openTime: "10:00", dueTime: "16:30" } };
    const stock = phaseScheduleForWorkDate("stock-work", "2026-07-06", windows);

    assert.equal(stock.startLabel, "10:00");
    assert.equal(stock.dueLabel, "16:30");
    assert.equal(stock.hasOpenTime, true);
    // 16:30 Bangkok = 09:30 UTC
    assert.equal(isPhasePastDue("stock-work", "2026-07-06", new Date("2026-07-06T09:29:00.000Z"), windows), false);
    assert.equal(isPhasePastDue("stock-work", "2026-07-06", new Date("2026-07-06T09:31:00.000Z"), windows), true);

    // A malformed time falls back to the built-in deadline rather than scoring nonsense.
    const broken = phaseScheduleForWorkDate("stock-work", "2026-07-06", { "stock-work": { dueTime: "ไม่ใช่เวลา" } });
    assert.equal(broken.dueLabel, "18:00");
  });

  it("allows workflow work from 09:00 to 23:59 Bangkok time", () => {
    assert.equal(isWithinWorkflowWorkHours(new Date("2026-07-06T01:59:00.000Z")), false);
    assert.equal(isWithinWorkflowWorkHours(new Date("2026-07-06T02:00:00.000Z")), true);
    // 23:30 Bangkok — the closing shift is still inside its 19:00–23:59 window
    assert.equal(isWithinWorkflowWorkHours(new Date("2026-07-06T16:30:00.000Z")), true);
    assert.equal(isWithinWorkflowWorkHours(new Date("2026-07-06T17:00:00.000Z")), false);
  });

  it("lets หัวข้อ be done in any order", () => {
    // The routine used to be sequenced: a phase only opened once the one before it was
    // submitted. Each หัวข้อ now stands on its own clock time instead.
    assert.equal(isPhaseUnlocked("close-store", "2026-07-04", []), true);
    assert.equal(isPhaseUnlocked("stock-work", "2026-07-04", []), true);
    assert.equal(isPhaseUnlocked("stock-work", "2026-07-04", [], ["daytime-work", "stock-work"]), true);
  });

  it("marks submitted phase records on time when submitted before the schedule end", () => {
    assert.equal(
      isWorkflowRecordOnTime({
        workDate: "2026-07-06",
        phaseId: "open-store",
        phaseTitle: "เปิดร้าน",
        completed: 7,
        total: 7,
        status: "submitted",
        recordedAt: "2026-07-06T07:31:00.000Z",
        startedAt: "2026-07-06T07:31:00.000Z",
        dueAt: "2026-07-06T08:00:00.000Z",
        submittedAt: "2026-07-06T07:59:00.000Z"
      }),
      true
    );
  });

  it("maps workflow records to white, green, orange, red, and purple visual states", () => {
    // 11:00 Bangkok — เปิดร้าน is due at 12:00, still on the clock
    assert.equal(
      workflowVisualStatus([], "2026-07-06", "open-store", new Date("2026-07-06T04:00:00.000Z")),
      "white"
    );
    // 15:00 Bangkok — past the deadline but still handable in for -2
    assert.equal(
      workflowVisualStatus([], "2026-07-06", "open-store", new Date("2026-07-06T08:01:00.000Z")),
      "orange"
    );
    // next morning — the day closed at 23:59 and the phase is lost
    assert.equal(
      workflowVisualStatus([], "2026-07-06", "open-store", new Date("2026-07-07T00:30:00.000Z")),
      "red"
    );

    const greenRecord: WorkflowDailyRecord = {
      workDate: "2026-07-06",
      phaseId: "open-store",
      phaseTitle: "เปิดร้าน",
      completed: 7,
      total: 7,
      status: "submitted",
      recordedAt: "2026-07-06T07:50:00.000Z",
      dueAt: "2026-07-06T08:00:00.000Z",
      submittedAt: "2026-07-06T07:55:00.000Z"
    };
    assert.equal(workflowVisualStatus([greenRecord], "2026-07-06", "open-store"), "green");

    const orangeRecord: WorkflowDailyRecord = {
      ...greenRecord,
      submittedAt: "2026-07-06T08:05:00.000Z"
    };
    assert.equal(workflowVisualStatus([orangeRecord], "2026-07-06", "open-store"), "orange");

    const purpleRecords: WorkflowDailyRecord[] = [
      { ...greenRecord, workDate: "2026-07-04", recordedAt: "2026-07-04T02:10:00.000Z", dueAt: "2026-07-04T02:30:00.000Z", submittedAt: "2026-07-04T02:20:00.000Z" },
      { ...greenRecord, workDate: "2026-07-05", recordedAt: "2026-07-05T02:10:00.000Z", dueAt: "2026-07-05T02:30:00.000Z", submittedAt: "2026-07-05T02:20:00.000Z" },
      greenRecord
    ];
    assert.equal(workflowVisualStatus(purpleRecords, "2026-07-06", "open-store"), "purple");
  });
});
