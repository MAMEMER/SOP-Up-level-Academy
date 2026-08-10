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
  preserveFirstSubmission,
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
    // Fixed windows, same on weekday and weekend, one clock time per หัวข้อ:
    //   กะ1 เปิดร้าน + Stock : 09:00–13:00
    //   หลังเปิดร้าน (แชท/Exp ค้าง, จัดส่งสินค้า) : 09:00–20:00
    //   กะ2 ปิดร้าน : 19:00–23:59
    for (const workDate of ["2026-07-06" /* Mon */, "2026-07-05" /* Sun */]) {
      const open = phaseScheduleForWorkDate("open-store", workDate);
      const stock = phaseScheduleForWorkDate("stock-work", workDate);
      const chat = phaseScheduleForWorkDate("guild-chat-exp", workDate);
      const shipping = phaseScheduleForWorkDate("daytime-work", workDate);
      const close = phaseScheduleForWorkDate("close-store", workDate);

      assert.equal(open.startLabel, "09:00");
      assert.equal(open.dueLabel, "13:00");
      assert.equal(open.dueMinutes, 240);
      assert.equal(stock.dueLabel, "13:00");
      assert.equal(chat.dueLabel, "20:00");
      assert.equal(shipping.dueLabel, "20:00");
      assert.equal(close.startLabel, "19:00");
      assert.equal(close.dueLabel, "23:59");
      // ปิดร้าน is the one หัวข้อ locked until its start time
      assert.equal(close.hasOpenTime, true);
      assert.equal(open.hasOpenTime, false);
      // every หัวข้อ closes for good at end of day, whatever its own deadline is
      assert.equal(open.endLabel, "23:59");
    }

    // open-store due at 13:00 Bangkok = 06:00 UTC.
    assert.equal(isPhasePastDue("open-store", "2026-07-06", new Date("2026-07-06T05:59:00.000Z")), false);
    assert.equal(isPhasePastDue("open-store", "2026-07-06", new Date("2026-07-06T06:01:00.000Z")), true);
    // close-store due at 23:59 Bangkok = 16:59 UTC.
    assert.equal(isPhasePastDue("close-store", "2026-07-06", new Date("2026-07-06T16:58:00.000Z")), false);
    assert.equal(isPhasePastDue("close-store", "2026-07-06", new Date("2026-07-06T16:59:30.000Z")), true);
  });

  it("moves the Stock window to the evening for กะ2 (ใบงาน TnkYKc7ha4Go07Az8m74)", () => {
    // Stock is shared by both shifts. กะ1 counts in the morning (09:00–13:00); กะ2 counts
    // at closing (19:00–23:00). Only the s2 Stock window shifts.
    const s1Stock = phaseScheduleForWorkDate("stock-work", "2026-07-06", { shift: "s1" });
    const s2Stock = phaseScheduleForWorkDate("stock-work", "2026-07-06", { shift: "s2" });
    assert.equal(s1Stock.startLabel, "09:00");
    assert.equal(s1Stock.dueLabel, "13:00");
    assert.equal(s2Stock.startLabel, "19:00");
    assert.equal(s2Stock.dueLabel, "23:00");
    assert.equal(s2Stock.hasOpenTime, true);

    const s2Chat = phaseScheduleForWorkDate("guild-chat-exp", "2026-07-06", { shift: "s2" });
    assert.equal(s2Chat.dueLabel, "20:00");
  });

  it("locks a หัวข้อ until its start time and closes every one at 23:59", () => {
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

  it("keeps a หัวข้อ past its deadline open until the day ends, then misses it", () => {
    const late = new Date("2026-07-06T07:00:00.000Z"); // 14:00 Bangkok, เปิดร้าน due 13:00
    const nextDay = new Date("2026-07-07T00:30:00.000Z");

    // Late is a 2-point deduction, not a lost หัวข้อ — it must stay submittable.
    assert.equal(isPhasePastDue("open-store", "2026-07-06", late), true);
    assert.equal(isPhaseSubmittable("open-store", "2026-07-06", late), true);
    assert.equal(shouldAutoMissWorkflowRecord(undefined, "open-store", "2026-07-06", late), false);
    assert.equal(workflowVisualStatus([], "2026-07-06", "open-store", late), "orange");

    assert.equal(shouldAutoMissWorkflowRecord(undefined, "open-store", "2026-07-06", nextDay), true);
    assert.equal(workflowVisualStatus([], "2026-07-06", "open-store", nextDay), "red");
  });

  it("uses the owner's configured window when there is one", () => {
    const context = { windows: { "stock-work": { openTime: "10:00", dueTime: "16:30" } } };
    const stock = phaseScheduleForWorkDate("stock-work", "2026-07-06", context);

    assert.equal(stock.startLabel, "10:00");
    assert.equal(stock.dueLabel, "16:30");
    assert.equal(stock.hasOpenTime, true);
    // 16:30 Bangkok = 09:30 UTC
    assert.equal(isPhasePastDue("stock-work", "2026-07-06", new Date("2026-07-06T09:29:00.000Z"), context), false);
    assert.equal(isPhasePastDue("stock-work", "2026-07-06", new Date("2026-07-06T09:31:00.000Z"), context), true);

    // "เปิดให้กดตลอด" = no start time configured
    const alwaysOpen = phaseScheduleForWorkDate("close-store", "2026-07-06", { windows: { "close-store": { dueTime: "23:59" } } });
    assert.equal(alwaysOpen.hasOpenTime, false);
    assert.equal(isPhaseNotYetOpen("close-store", "2026-07-06", new Date("2026-07-06T04:00:00.000Z"), { windows: { "close-store": { dueTime: "23:59" } } }), false);

    // A malformed time falls back to the built-in deadline rather than scoring nonsense.
    const broken = phaseScheduleForWorkDate("stock-work", "2026-07-06", { windows: { "stock-work": { dueTime: "ไม่ใช่เวลา" } } });
    assert.equal(broken.dueLabel, "13:00");
  });

  it("allows workflow work from 09:00 to 23:59 Bangkok time", () => {
    assert.equal(isWithinWorkflowWorkHours(new Date("2026-07-06T01:59:00.000Z")), false); // 08:59
    assert.equal(isWithinWorkflowWorkHours(new Date("2026-07-06T02:00:00.000Z")), true); // 09:00
    assert.equal(isWithinWorkflowWorkHours(new Date("2026-07-06T16:59:00.000Z")), true); // 23:59
    assert.equal(isWithinWorkflowWorkHours(new Date("2026-07-06T17:00:00.000Z")), false); // 00:00
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
    assert.equal(
      // 05:40 UTC = 12:40 Bangkok — still inside the open-store window (09:00–13:00).
      workflowVisualStatus([], "2026-07-06", "open-store", new Date("2026-07-06T05:40:00.000Z")),
      "white"
    );
    assert.equal(
      // 06:01 UTC = 13:01 Bangkok — past the 13:00 due but still handable in for -2 → orange.
      workflowVisualStatus([], "2026-07-06", "open-store", new Date("2026-07-06T06:01:00.000Z")),
      "orange"
    );
    assert.equal(
      // next morning — the day closed at 23:59 and the หัวข้อ is lost → red.
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

describe("preserveFirstSubmission (กดส่งซ้ำต้องไม่กลายเป็นส่งช้า)", () => {
  const base = {
    workDate: "2026-08-10",
    phaseId: "open-store",
    phaseTitle: "เปิดร้าน",
    completed: 7,
    total: 7,
    status: "submitted" as const,
    dueAt: "2026-08-10T13:00:00+07:00"
  };
  const first = { ...base, recordedAt: "2026-08-10T12:40:00+07:00", startedAt: "2026-08-10T11:12:00+07:00", submittedAt: "2026-08-10T12:40:00+07:00" };
  const second = { ...base, recordedAt: "2026-08-10T15:03:00+07:00", startedAt: "2026-08-10T11:12:00+07:00", submittedAt: "2026-08-10T15:03:00+07:00" };

  it("เก็บเวลาส่งครั้งแรกไว้ ไม่ให้รอบหลังทับ", () => {
    const [merged] = preserveFirstSubmission([first], [second]);
    assert.equal(merged.submittedAt, first.submittedAt);
    assert.equal(isWorkflowRecordOnTime(merged), true);
  });

  it("หัวข้อที่ส่งทันเวลา ไม่กลายเป็นส่งช้าเพราะการกดซ้ำ", () => {
    assert.equal(isWorkflowRecordOnTime(second), false);
    assert.equal(isWorkflowRecordOnTime(preserveFirstSubmission([first], [second])[0]), true);
  });

  it("ยังเก็บเวลาเริ่มงานครั้งแรก", () => {
    const restarted = { ...second, startedAt: "2026-08-10T14:50:00+07:00" };
    assert.equal(preserveFirstSubmission([first], [restarted])[0].startedAt, first.startedAt);
  });

  it("หัวข้อที่ยังไม่เคยส่ง บันทึกเวลาส่งตามปกติ", () => {
    const draft = { ...first, status: "saved" as const, submittedAt: undefined };
    assert.equal(preserveFirstSubmission([draft], [second])[0].submittedAt, second.submittedAt);
  });

  it("หัวข้อใหม่ที่ยังไม่มีของเดิม ผ่านไปตรงๆ", () => {
    assert.deepEqual(preserveFirstSubmission([], [second]), [second]);
  });

  it("admin ปลดล็อกให้ทำใหม่ → เวลาส่งรอบใหม่คือของจริง", () => {
    const unlocked = { ...second, adminUnlockedAt: "2026-08-10T14:00:00+07:00" };
    assert.equal(preserveFirstSubmission([first], [unlocked])[0].submittedAt, second.submittedAt);
  });

  it("ปลดล็อกก่อนการส่งครั้งแรก ไม่ถือว่าเปิดให้ส่งใหม่", () => {
    const early = { ...first, adminUnlockedAt: "2026-08-10T09:00:00+07:00" };
    const again = { ...second, adminUnlockedAt: "2026-08-10T09:00:00+07:00" };
    assert.equal(preserveFirstSubmission([early], [again])[0].submittedAt, first.submittedAt);
  });


  it("แท็บเก่าที่ส่งข้อมูลชุดเดิมมาทับ ต้องไม่ลบหัวข้อที่ส่งไปแล้ว", () => {
    const stock = { ...base, phaseId: "stock-work", phaseTitle: "Stock", recordedAt: "2026-08-10T14:00:00+07:00", submittedAt: "2026-08-10T14:00:00+07:00" };
    const merged = preserveFirstSubmission([first, stock], [second]);
    assert.equal(merged.length, 2);
    assert.equal(merged.find((r) => r.phaseId === "stock-work")?.submittedAt, stock.submittedAt);
  });

  it("จับคู่ตาม phaseId ไม่ปนข้ามหัวข้อ", () => {
    const other = { ...second, phaseId: "stock-work", phaseTitle: "Stock" };
    const merged = preserveFirstSubmission([first], [second, other]);
    assert.equal(merged[0].submittedAt, first.submittedAt);
    assert.equal(merged[1].submittedAt, second.submittedAt);
  });
});
