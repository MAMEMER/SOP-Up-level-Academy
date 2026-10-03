import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeActuals, onePerStaffDay } from "../lib/planner-kpi.ts";

// คนเดียวถูกบันทึกซ้ำสองสาขาในวันเดียว (บั๊กปุ่ม "บันทึกทั้งหมด") — KPI ต้องเหลือกะเดียว
test("onePerStaffDay keeps the most recently edited working shift", () => {
  const rows = onePerStaffDay([
    { branch: "bangkae", workDate: "2026-10-04", staffCode: "UP-006", assignment: "s1", updatedAt: "2026-10-02T12:03:00Z" },
    { branch: "senafest", workDate: "2026-10-04", staffCode: "UP-006", assignment: "s1", updatedAt: "2026-10-02T13:08:00Z" }
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].branch, "senafest");
});

test("onePerStaffDay prefers a working shift over OFF regardless of order", () => {
  const rows = onePerStaffDay([
    { branch: "senafest", workDate: "2026-10-05", staffCode: "UP-007", assignment: "s2", updatedAt: "2026-10-01T00:00:00Z" },
    { branch: "bangkae", workDate: "2026-10-05", staffCode: "UP-007", assignment: "off", updatedAt: "2026-10-02T00:00:00Z" }
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].assignment, "s2");
});

test("mergeActuals collapses duplicate clock-ins to the earliest", () => {
  const rows = mergeActuals([
    { branch: "bangkae", workDate: "2026-10-02", staffCode: "UP-006", clockIn: "09:37" },
    { branch: "senafest", workDate: "2026-10-02", staffCode: "UP-006", clockIn: "09:35", leaveType: undefined }
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].clockIn, "09:35");
});

import { branchForStoreHubStore, teamRecordName, isTeamRecordName } from "../lib/store-config.ts";
import { DELIVERY_BRANCH } from "../lib/delivery-tasks.ts";

test("storeId ของเครื่อง POS บอกสาขาที่ตอกบัตรจริง", () => {
  assert.equal(branchForStoreHubStore("6a268170c008ab000760e21a"), "bangkae");
  assert.equal(branchForStoreHubStore("6aaa02f0a568500007542756"), "senafest");
  assert.equal(branchForStoreHubStore("6a268172c008ab000760e2cb"), undefined); // Digital Store
  assert.equal(branchForStoreHubStore(undefined), undefined);
});

test("งานทีมแยกชื่อตามสาขา", () => {
  assert.equal(teamRecordName("bangkae"), "ทีม บางแค");
  assert.equal(teamRecordName("senafest"), "ทีม เสนาเฟสต์");
  assert.equal(isTeamRecordName("ทีม บางแค"), true);
  assert.equal(isTeamRecordName("UP-003"), false);
});

test("ออเดอร์ออนไลน์เป็นงานของเสนาเฟสต์", () => {
  assert.equal(DELIVERY_BRANCH, "senafest");
});
