import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canEditWorkflowRecord,
  canAdminUnlockWorkflowRecord,
  formatWorkDate,
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

  it("uses the fixed Bang Khae checklist windows every day (ใบงาน fnpHvruMlF4Vvg7UvJUQ)", () => {
    // Fixed windows now, same on weekday and weekend:
    //   กะ1 เปิดร้าน + Stock : 09:00–13:00
    //   กะ1 หลังเปิดร้าน (แชท/Exp ค้าง, จัดส่งสินค้า) : 09:00–20:00
    //   กะ2 ปิดร้าน : 19:00–23:59
    for (const workDate of ["2026-07-06" /* Mon */, "2026-07-05" /* Sun */]) {
      const open = phaseScheduleForWorkDate("open-store", workDate);
      const stock = phaseScheduleForWorkDate("stock-work", workDate);
      const chat = phaseScheduleForWorkDate("guild-chat-exp", workDate);
      const shipping = phaseScheduleForWorkDate("daytime-work", workDate);
      const close = phaseScheduleForWorkDate("close-store", workDate);

      assert.equal(open.startLabel, "09:00");
      assert.equal(open.endLabel, "13:00");
      assert.equal(open.dueMinutes, 240);
      assert.equal(stock.startLabel, "09:00");
      assert.equal(stock.endLabel, "13:00");
      assert.equal(chat.startLabel, "09:00");
      assert.equal(chat.endLabel, "20:00");
      assert.equal(shipping.startLabel, "09:00");
      assert.equal(shipping.endLabel, "20:00");
      assert.equal(close.startLabel, "19:00");
      assert.equal(close.endLabel, "23:59");
      assert.equal(close.dueMinutes, 299);
    }

    // open-store now due at 13:00 Bangkok = 06:00 UTC.
    assert.equal(isPhasePastDue("open-store", "2026-07-06", new Date("2026-07-06T05:59:00.000Z")), false);
    assert.equal(isPhasePastDue("open-store", "2026-07-06", new Date("2026-07-06T06:01:00.000Z")), true);
    // close-store now due at 23:59 Bangkok = 16:59 UTC.
    assert.equal(isPhasePastDue("close-store", "2026-07-06", new Date("2026-07-06T16:58:00.000Z")), false);
    assert.equal(isPhasePastDue("close-store", "2026-07-06", new Date("2026-07-06T16:59:30.000Z")), true);
  });

  it("keeps the fixed window regardless of shift context", () => {
    // The windows no longer vary by clock-in time — shift context is accepted but ignored.
    const base = phaseScheduleForWorkDate("open-store", "2026-07-06");
    const s1At11 = phaseScheduleForWorkDate("open-store", "2026-07-06", { shift: "s1", shiftStart: "11:00" });
    const s2 = phaseScheduleForWorkDate("open-store", "2026-07-06", { shift: "s2", shiftStart: "13:00" });
    assert.equal(s1At11.startLabel, base.startLabel);
    assert.equal(s1At11.endLabel, base.endLabel);
    assert.equal(s2.endLabel, base.endLabel);
    assert.equal(base.startLabel, "09:00");
    assert.equal(base.endLabel, "13:00");
  });

  it("allows workflow work from 09:00 to 23:59 Bangkok time", () => {
    assert.equal(isWithinWorkflowWorkHours(new Date("2026-07-06T01:59:00.000Z")), false); // 08:59
    assert.equal(isWithinWorkflowWorkHours(new Date("2026-07-06T02:00:00.000Z")), true); // 09:00
    assert.equal(isWithinWorkflowWorkHours(new Date("2026-07-06T15:59:00.000Z")), true); // 22:59
    assert.equal(isWithinWorkflowWorkHours(new Date("2026-07-06T16:59:00.000Z")), true); // 23:59
    assert.equal(isWithinWorkflowWorkHours(new Date("2026-07-06T17:00:00.000Z")), false); // 00:00
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
      },
      {
        workDate: "2026-07-04",
        phaseId: "guild-chat-exp",
        phaseTitle: "จัดการแชทและ Exp ค้าง",
        completed: 2,
        total: 2,
        status: "submitted",
        recordedAt: "2026-07-04T09:20:00Z"
      }
    ];

    assert.equal(isPhaseUnlocked("open-store", "2026-07-04", []), true);
    assert.equal(isPhaseUnlocked("daytime-work", "2026-07-04", records), true);
    assert.equal(isPhaseUnlocked("stock-work", "2026-07-04", records), false);
    assert.equal(isPhaseUnlocked("close-store", "2026-07-04", records), false);

    const daytimeDone = [
      ...records,
      {
        workDate: "2026-07-04",
        phaseId: "daytime-work",
        phaseTitle: "จัดส่งสินค้า",
        completed: 4,
        total: 4,
        status: "submitted",
        recordedAt: "2026-07-04T10:00:00Z"
      } satisfies WorkflowDailyRecord
    ];
    assert.equal(isPhaseUnlocked("stock-work", "2026-07-04", daytimeDone), true);
  });

  it("sequences only within the phases the shift actually sees", () => {
    // An s2 staffer never gets open-store, so their own records can't contain it. Gating
    // on it would leave their whole day locked.
    const visible = ["daytime-work", "stock-work", "close-store"];

    assert.equal(isPhaseUnlocked("daytime-work", "2026-07-04", [], visible), true);
    assert.equal(isPhaseUnlocked("stock-work", "2026-07-04", [], visible), false);
    assert.equal(isPhaseUnlocked("daytime-work", "2026-07-04", []), false);
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
      },
      {
        workDate: "2026-07-04",
        phaseId: "guild-chat-exp",
        phaseTitle: "จัดการแชทและ Exp ค้าง",
        completed: 0,
        total: 2,
        status: "missed",
        recordedAt: "2026-07-04T02:31:00.000Z"
      }
    ];

    assert.equal(isPhaseUnlocked("daytime-work", "2026-07-04", missedOpen), true);

    const missedDaytime = [
      ...missedOpen,
      {
        workDate: "2026-07-04",
        phaseId: "daytime-work",
        phaseTitle: "จัดส่งสินค้า",
        completed: 0,
        total: 4,
        status: "missed",
        recordedAt: "2026-07-04T12:31:00.000Z"
      } satisfies WorkflowDailyRecord
    ];

    assert.equal(isPhaseUnlocked("stock-work", "2026-07-04", missedDaytime), true);
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
      // 05:40 UTC = 12:40 Bangkok — still inside the open-store window (09:00–13:00).
      workflowVisualStatus([], "2026-07-06", "open-store", new Date("2026-07-06T05:40:00.000Z")),
      "white"
    );
    assert.equal(
      // 06:01 UTC = 13:01 Bangkok — past the 13:00 due, unstarted → red.
      workflowVisualStatus([], "2026-07-06", "open-store", new Date("2026-07-06T06:01:00.000Z")),
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
