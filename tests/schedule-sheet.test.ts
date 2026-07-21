import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseScheduleSheetCsv, scheduleSheetCsvUrl } from "../lib/schedule-sheet.ts";

describe("clean schedule sheet reader", () => {
  const csv = [
    '"วันที่","รหัสพนักงาน","เข้ากะ","สถานะ"',
    '"2026-08-01","ICE","11:00","ทำงาน"',
    '"2026-08-01","Boom","13:30","ทำงาน"',
    '"2026-08-02","Leo","OFF","ทำงาน"',
    '"2026-08-03","Boom","","ลาป่วย"',
    '"2026-08-04","ICE","09:00","ทำงาน"',
    '"2026-08-05","Leo","","ลากิจ"'
  ].join("\n");

  it("parses working shifts into schedules with +07:00 start", () => {
    const { schedules } = parseScheduleSheetCsv(csv);
    assert.equal(schedules.length, 3);
    const ice = schedules.find((s) => s.employeeName === "ICE" && s.workDate === "2026-08-01");
    assert.ok(ice);
    assert.equal(ice.scheduledStart, "2026-08-01T11:00:00+07:00");
    assert.equal(ice.source, "google-sheet");
  });

  it("skips OFF and blank shifts", () => {
    const { schedules } = parseScheduleSheetCsv(csv);
    assert.equal(schedules.some((s) => s.employeeName === "Leo" && s.workDate === "2026-08-02"), false);
  });

  it("reads sick and personal leave from the สถานะ column", () => {
    const { leaves } = parseScheduleSheetCsv(csv);
    assert.equal(leaves.length, 2);
    assert.deepEqual(
      leaves.map((l) => `${l.employeeName}:${l.type}`).sort(),
      ["Boom:sick", "Leo:personal"]
    );
  });

  it("resolves StoreHub-style aliases to canonical codes", () => {
    const aliased = '"วันที่","พนักงาน","กะ","สถานะ"\n"2026-08-01","UP ICE","11:00","ทำงาน"';
    const { schedules } = parseScheduleSheetCsv(aliased);
    assert.equal(schedules[0].employeeName, "ICE");
  });

  it("returns empty on malformed / headerless input", () => {
    assert.deepEqual(parseScheduleSheetCsv(""), { schedules: [], leaves: [] });
    assert.deepEqual(parseScheduleSheetCsv('"a","b"\n"x","y"'), { schedules: [], leaves: [] });
  });

  it("builds a gviz csv export url", () => {
    const url = scheduleSheetCsvUrl("SHEET123", "KPI");
    assert.equal(url, "https://docs.google.com/spreadsheets/d/SHEET123/gviz/tq?tqx=out:csv&sheet=KPI");
  });
});
