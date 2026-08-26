import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildStaffNotifications,
  notificationTimeLabel,
  unreadByKind,
  unreadCount
} from "../lib/staff-notifications.ts";

const STAFF = "UP-003";
const SEEN = "2026-08-20T00:00:00.000Z";

function base() {
  return {
    staffCode: STAFF,
    lastSeenAt: SEEN,
    assignments: [] as never[],
    projects: [] as never[],
    deliveries: [] as never[],
    coaching: [] as never[],
    feedback: [] as never[]
  };
}

describe("รวมทุกแหล่งเป็นรายการเดียว", () => {
  it("งานใหม่ · ต้องแก้ · ส่งต่อ · ส่งของ · คำแนะนำ · เสียงลูกค้า มาครบและเรียงใหม่สุดก่อน", () => {
    const items = buildStaffNotifications({
      ...base(),
      assignments: [
        { id: "wa1", title: "ส่งพัสดุ", status: "open", workDate: "2026-08-25", createdAt: "2026-08-25T01:00:00.000Z" },
        { id: "wa2", title: "เช็คสต๊อก", status: "needs_revision", workDate: "2026-08-24", createdAt: "2026-08-24T01:00:00.000Z", reviewedAt: "2026-08-25T02:00:00.000Z", revisionNote: "ใส่รูปให้ครบ" },
        { id: "wa3", title: "งานที่ส่งแล้ว", status: "submitted", workDate: "2026-08-23", createdAt: "2026-08-23T01:00:00.000Z" }
      ] as never,
      projects: [
        { id: "wp1", title: "จัดชั้นการ์ด", createdAt: "2026-08-22T01:00:00.000Z", assignees: [STAFF], handovers: [{ id: "h1", to: STAFF, from: "UP-005", at: "2026-08-25T03:00:00.000Z", note: "เหลือชั้น 3" }] }
      ] as never,
      deliveries: [
        { id: "d1", title: "ORD-1 · คุณเอ", at: "2026-08-25T04:00:00.000Z", status: "open" },
        { id: "d2", title: "ORD-2 · คุณบี", at: "2026-08-25T05:00:00.000Z", status: "shipped" }
      ] as never,
      coaching: [{ id: "c1", note: "ลองกดส่งทีละหัวข้อ", createdAt: "2026-08-21T01:00:00.000Z", acknowledgedAt: "2026-08-21T02:00:00.000Z" }] as never,
      feedback: [{ id: "f1", kind: "praise", message: "ช่วยหาการ์ดให้จนเจอ", createdAt: "2026-08-25T06:00:00.000Z" }] as never
    });

    assert.deepEqual(items.map((item) => item.id), ["sf-f1", "dl-d1", "ho-h1", "rev-wa2", "wa-wa1", "wp-wp1", "cn-c1"]);
    // งานที่ส่งไปแล้ว (submitted) และของที่ส่งของเสร็จแล้ว ไม่ต้องเตือนซ้ำ
    assert.equal(items.some((item) => item.id.includes("wa3")), false);
    assert.equal(items.some((item) => item.id.includes("d2")), false);
  });

  it("งานส่งต่อของคนอื่นไม่เด้งใส่เรา", () => {
    const items = buildStaffNotifications({
      ...base(),
      projects: [
        { id: "wp1", title: "งานคนอื่น", createdAt: "2026-08-25T01:00:00.000Z", assignees: ["UP-005"], handovers: [{ id: "h9", to: "UP-005", from: "UP-007", at: "2026-08-25T02:00:00.000Z" }] }
      ] as never
    });
    assert.deepEqual(items, []);
  });
});

describe("ยังไม่อ่าน", () => {
  it("อันที่เกิดก่อนเวลาเปิดหน้าล่าสุด ถือว่าอ่านแล้ว", () => {
    const items = buildStaffNotifications({
      ...base(),
      assignments: [
        { id: "old", title: "งานเก่า", status: "open", workDate: "2026-08-19", createdAt: "2026-08-19T01:00:00.000Z" },
        { id: "new", title: "งานใหม่", status: "open", workDate: "2026-08-25", createdAt: "2026-08-25T01:00:00.000Z" }
      ] as never
    });
    assert.deepEqual(items.map((item) => [item.id, item.unread]), [["wa-new", true], ["wa-old", false]]);
    assert.equal(unreadCount(items), 1);
  });

  it("ยังไม่เคยเปิดหน้าแจ้งเตือน = ทุกอย่างยังไม่อ่าน", () => {
    const items = buildStaffNotifications({
      ...base(),
      lastSeenAt: undefined,
      assignments: [{ id: "a", title: "งาน", status: "open", workDate: "2026-08-01", createdAt: "2026-08-01T00:00:00.000Z" }] as never
    });
    assert.equal(items[0].unread, true);
  });

  it("คำแนะนำหัวหน้าที่ยังไม่กดรับทราบ ยังไม่อ่านเสมอ แม้เปิดหน้าไปแล้ว", () => {
    const items = buildStaffNotifications({
      ...base(),
      coaching: [{ id: "c1", note: "อ่านด้วย", createdAt: "2026-08-01T00:00:00.000Z" }] as never
    });
    assert.equal(items[0].unread, true);
  });

  it("นับแยกหมวดให้ทำแถบสรุปได้", () => {
    const items = buildStaffNotifications({
      ...base(),
      assignments: [{ id: "a", title: "งาน", status: "open", workDate: "2026-08-25", createdAt: "2026-08-25T01:00:00.000Z" }] as never,
      feedback: [
        { id: "f1", kind: "complaint", message: "ช้า", createdAt: "2026-08-25T02:00:00.000Z" },
        { id: "f2", kind: "praise", message: "ดี", createdAt: "2026-08-25T03:00:00.000Z" }
      ] as never
    });
    assert.deepEqual(unreadByKind(items), [
      { kind: "feedback", count: 2 },
      { kind: "assigned_work", count: 1 }
    ]);
  });
});

describe("ข้อความเวลา", () => {
  it("บอกเป็นภาษาคน", () => {
    const now = new Date("2026-08-25T10:00:00.000Z");
    assert.equal(notificationTimeLabel("2026-08-25T09:58:00.000Z", now), "2 นาทีที่แล้ว");
    assert.equal(notificationTimeLabel("2026-08-25T07:00:00.000Z", now), "3 ชั่วโมงที่แล้ว");
    assert.equal(notificationTimeLabel("2026-08-23T10:00:00.000Z", now), "2 วันที่แล้ว");
    assert.equal(notificationTimeLabel("ไม่ใช่เวลา", now), "");
  });
});

describe("งานที่ปิดแล้ว", () => {
  it("โปรเจกต์ที่ done/cancelled ไม่เด้งอีก (รวมทั้งการส่งต่อของงานนั้น)", () => {
    const items = buildStaffNotifications({
      ...base(),
      projects: [
        { id: "done", title: "งานปิดแล้ว", status: "done", createdAt: "2026-08-25T01:00:00.000Z", assignees: [STAFF], handovers: [{ id: "h1", to: STAFF, from: "UP-005", at: "2026-08-25T02:00:00.000Z" }] },
        { id: "live", title: "งานที่ยังทำอยู่", status: "active", createdAt: "2026-08-25T03:00:00.000Z", assignees: [STAFF] }
      ] as never
    });
    assert.deepEqual(items.map((item) => item.id), ["wp-live"]);
  });
});
