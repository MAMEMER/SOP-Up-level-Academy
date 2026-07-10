import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canEditWorkflowRecord,
  canAdminUnlockWorkflowRecord,
  canPersistWorkflowRecords,
  formatWorkDate,
  isPhaseUnlocked,
  isPhasePastDue,
  isWithinWorkflowWorkHours,
  isWorkflowRecordOnTime,
  phaseScheduleForWorkDate,
  shouldAutoMissWorkflowRecord,
  summarizeMonthlyRecords,
  upsertWorkflowRecord,
  workflowVisualStatus,
  workflowRecordingEnabled,
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

  it("keeps workflow records in trial mode until recording is enabled", () => {
    assert.equal(workflowRecordingEnabled, false);
    assert.equal(canPersistWorkflowRecords(), false);
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

  it("uses Bang Khae store hours for weekday and weekend phase windows", () => {
    const weekdayOpen = phaseScheduleForWorkDate("open-store", "2026-07-06");
    const weekdayStock = phaseScheduleForWorkDate("stock-work", "2026-07-06");
    const weekdayShipping = phaseScheduleForWorkDate("daytime-work", "2026-07-06");
    const weekendClose = phaseScheduleForWorkDate("close-store", "2026-07-05");

    assert.equal(weekdayOpen.startLabel, "14:30");
    assert.equal(weekdayOpen.endLabel, "15:00");
    assert.equal(weekdayOpen.dueMinutes, 30);
    assert.equal(weekdayStock.startLabel, "15:00");
    assert.equal(weekdayStock.endLabel, "22:00");
    assert.equal(weekdayShipping.startLabel, "15:00");
    assert.equal(weekdayShipping.endLabel, "22:00");
    assert.equal(weekendClose.startLabel, "19:30");
    assert.equal(weekendClose.endLabel, "20:30");
    assert.equal(weekendClose.dueMinutes, 60);
    assert.equal(isPhasePastDue("open-store", "2026-07-06", new Date("2026-07-06T07:59:00.000Z")), false);
    assert.equal(isPhasePastDue("open-store", "2026-07-06", new Date("2026-07-06T08:01:00.000Z")), true);
  });

  it("allows workflow work only from 09:00 to 23:00 Bangkok time", () => {
    assert.equal(isWithinWorkflowWorkHours(new Date("2026-07-06T01:59:00.000Z")), false);
    assert.equal(isWithinWorkflowWorkHours(new Date("2026-07-06T02:00:00.000Z")), true);
    assert.equal(isWithinWorkflowWorkHours(new Date("2026-07-06T15:59:00.000Z")), true);
    assert.equal(isWithinWorkflowWorkHours(new Date("2026-07-06T16:00:00.000Z")), false);
  });

  it("keeps stock and shipping editable after time instead of auto-missing them", () => {
    const afterWeekdayClose = new Date("2026-07-06T15:30:00.000Z");

    assert.equal(shouldAutoMissWorkflowRecord(undefined, "stock-work", "2026-07-06", afterWeekdayClose), false);
    assert.equal(shouldAutoMissWorkflowRecord(undefined, "daytime-work", "2026-07-06", afterWeekdayClose), false);
    assert.equal(workflowVisualStatus([], "2026-07-06", "stock-work", afterWeekdayClose), "white");
    assert.equal(workflowVisualStatus([], "2026-07-06", "daytime-work", afterWeekdayClose), "white");

    const lateStockRecord: WorkflowDailyRecord = {
      workDate: "2026-07-06",
      phaseId: "stock-work",
      phaseTitle: "Stock",
      completed: 5,
      total: 5,
      status: "submitted",
      recordedAt: "2026-07-06T15:35:00.000Z",
      dueAt: phaseScheduleForWorkDate("stock-work", "2026-07-06").dueAt,
      submittedAt: "2026-07-06T15:35:00.000Z"
    };

    assert.equal(workflowVisualStatus([lateStockRecord], "2026-07-06", "stock-work"), "orange");
  });

  it("unlocks phases only after prior submitted checklists are complete", () => {
    const records: WorkflowDailyRecord[] = [
      {
        workDate: "2026-07-04",
        phaseId: "open-store",
        phaseTitle: "เปิดร้าน",
        completed: 7,
        total: 7,
        status: "submitted",
        recordedAt: "2026-07-04T09:00:00Z"
      }
    ];

    assert.equal(isPhaseUnlocked("open-store", "2026-07-04", []), true);
    assert.equal(isPhaseUnlocked("stock-work", "2026-07-04", records), true);
    assert.equal(isPhaseUnlocked("daytime-work", "2026-07-04", records), false);
    assert.equal(isPhaseUnlocked("close-store", "2026-07-04", records), false);

    const stockDone = [
      ...records,
      {
        workDate: "2026-07-04",
        phaseId: "stock-work",
        phaseTitle: "Stock",
        completed: 4,
        total: 4,
        status: "submitted",
        recordedAt: "2026-07-04T10:00:00Z"
      } satisfies WorkflowDailyRecord
    ];
    assert.equal(isPhaseUnlocked("daytime-work", "2026-07-04", stockDone), true);
  });

  it("unlocks the next phase when the prior phase is already missed", () => {
    const missedOpen: WorkflowDailyRecord[] = [
      {
        workDate: "2026-07-04",
        phaseId: "open-store",
        phaseTitle: "เปิดร้าน",
        completed: 0,
        total: 7,
        status: "missed",
        recordedAt: "2026-07-04T02:31:00.000Z"
      }
    ];

    assert.equal(isPhaseUnlocked("stock-work", "2026-07-04", missedOpen), true);

    const missedStock = [
      ...missedOpen,
      {
        workDate: "2026-07-04",
        phaseId: "stock-work",
        phaseTitle: "Stock",
        completed: 0,
        total: 5,
        status: "missed",
        recordedAt: "2026-07-04T12:31:00.000Z"
      } satisfies WorkflowDailyRecord
    ];

    assert.equal(isPhaseUnlocked("daytime-work", "2026-07-04", missedStock), true);
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
    assert.equal(
      workflowVisualStatus([], "2026-07-06", "open-store", new Date("2026-07-06T07:40:00.000Z")),
      "white"
    );
    assert.equal(
      workflowVisualStatus([], "2026-07-06", "open-store", new Date("2026-07-06T08:01:00.000Z")),
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
