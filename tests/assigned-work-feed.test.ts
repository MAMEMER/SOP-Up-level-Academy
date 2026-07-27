import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assignedWorkFeedForViewer,
  handoffToFeedItem,
  ownerAssignmentToFeedItem,
  type HandoffInput,
  type OwnerAssignmentInput
} from "../lib/assigned-work-feed.ts";

const ownerAssignment: OwnerAssignmentInput = {
  id: "wa__2026-07-27__ICE__x",
  branch: "bangkae",
  workDate: "2026-07-27",
  staffCode: "ICE",
  title: "ส่งเสื้อให้ลูกค้าคุณ A",
  detail: "รอบ 14:30",
  status: "open",
  assignedBy: "owner@shop"
};

const handoff: HandoffInput = {
  id: "ho__2026-07-27__Boom__x",
  branch: "bangkae",
  workDate: "2026-07-27",
  title: "ลูกค้าฝากเด็คไว้รอเช็ค",
  detail: "อยู่ลิ้นชักหน้าเคาน์เตอร์",
  fromStaff: "Boom",
  toStaff: "any",
  status: "open"
};

describe("assigned-work feed mappers", () => {
  it("maps an owner assignment to a feed item flagged as owner-assigned", () => {
    const item = ownerAssignmentToFeedItem(ownerAssignment);
    assert.equal(item.origin, "owner");
    assert.equal(item.title, "ส่งเสื้อให้ลูกค้าคุณ A");
    assert.equal(item.assigneeLabel, "ICE");
    assert.equal(item.originLabel, "มอบหมายโดยเจ้าของร้าน");
    assert.equal(item.statusText, "รอทำ");
    assert.equal(item.statusClass, "workflow-status-white");
    assert.equal(item.href, "/admin/assign");
    assert.equal(item.staffCode, "ICE");
  });

  it("marks a done owner assignment green", () => {
    const item = ownerAssignmentToFeedItem({ ...ownerAssignment, status: "done" });
    assert.equal(item.statusText, "เสร็จแล้ว");
    assert.equal(item.statusClass, "workflow-status-green");
  });

  it("maps a closing-shift handoff to a feed item flagged as handoff", () => {
    const item = handoffToFeedItem(handoff);
    assert.equal(item.origin, "handoff");
    assert.equal(item.assigneeLabel, "ใครก็ได้กะถัดไป");
    assert.equal(item.originLabel, "ส่งต่อจากกะปิดร้าน · จาก Boom");
    assert.equal(item.statusText, "รอรับงาน");
    assert.equal(item.href, "/handoff");
    assert.equal(item.toStaff, "any");
    assert.equal(item.fromStaff, "Boom");
  });

  it("shows the claimer on a claimed handoff", () => {
    const item = handoffToFeedItem({ ...handoff, status: "claimed", claimedBy: "Leo" });
    assert.equal(item.statusClass, "workflow-status-orange");
    assert.equal(item.statusText, "รับแล้ว · Leo");
    assert.equal(item.claimedBy, "Leo");
  });
});

describe("assigned-work feed viewer filtering", () => {
  const items = [
    ownerAssignmentToFeedItem(ownerAssignment), // owner -> ICE
    ownerAssignmentToFeedItem({ ...ownerAssignment, id: "wa2", staffCode: "Boom" }), // owner -> Boom
    handoffToFeedItem(handoff), // handoff -> any, from Boom
    handoffToFeedItem({ ...handoff, id: "ho2", toStaff: "Leo", fromStaff: "ICE" }) // handoff -> Leo
  ];

  it("owner (admin) sees everything from both sources", () => {
    const seen = assignedWorkFeedForViewer(items, { isAdmin: true, employeeCode: null });
    assert.equal(seen.length, 4);
  });

  it("staff sees only their own owner-assignments plus relevant handoffs", () => {
    const ice = assignedWorkFeedForViewer(items, { isAdmin: false, employeeCode: "ICE" });
    // owner->ICE, handoff any, handoff from ICE
    assert.deepEqual(ice.map((i) => i.id).sort(), ["ho2", "ho__2026-07-27__Boom__x", "wa__2026-07-27__ICE__x"].sort());
    assert.equal(ice.some((i) => i.id === "wa2"), false);
  });

  it("staff with no employee code sees nothing", () => {
    assert.equal(assignedWorkFeedForViewer(items, { isAdmin: false, employeeCode: null }).length, 0);
  });

  it("Leo sees the any-handoff and the handoff targeted at Leo, but not Boom's owner task", () => {
    const leo = assignedWorkFeedForViewer(items, { isAdmin: false, employeeCode: "Leo" });
    assert.deepEqual(leo.map((i) => i.id).sort(), ["ho2", "ho__2026-07-27__Boom__x"].sort());
  });
});
