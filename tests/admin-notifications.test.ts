import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAdminNotifications,
  notificationHeadline,
  sortNotifications,
  summariseNotifications,
  type AdminNotification,
  type NotificationInput
} from "../lib/admin-notifications.ts";

const noGuild: NotificationInput["guild"] = {
  expClaims: 0,
  questSubmissions: 0,
  shopRequests: 0,
  coinTopups: 0,
  mergeRequests: 0,
  guildShopOrders: 0,
  pendingMembers: 0
};

const quiet: NotificationInput = {
  storageReady: true,
  deliveries: { overdue: 0, unshipped: 0, unclaimed: 0 },
  pressesWithoutRecord: [],
  assignments: { waitingReview: 0, overdue: 0 },
  handoffs: { open: 0 },
  checklist: { latePhases: 0, notStartedStaff: [] },
  bugReports: { open: 0 },
  guild: noGuild
};

const ids = (items: AdminNotification[]) => items.map((item) => item.id);

describe("buildAdminNotifications", () => {
  it("วันที่ไม่มีอะไรค้าง ไม่ต้องเตือนอะไรเลย", () => {
    assert.deepEqual(buildAdminNotifications(quiet), []);
  });

  it("ออเดอร์เลยกำหนดส่งเป็นเรื่องด่วน", () => {
    const items = buildAdminNotifications({ ...quiet, deliveries: { overdue: 2, unshipped: 3, unclaimed: 1 } });
    assert.equal(items[0].id, "delivery-overdue");
    assert.equal(items[0].level, "urgent");
    assert.equal(items[0].count, 2);
  });

  it("ยังไม่เลยกำหนด แจ้งแค่ว่ามีออเดอร์รอส่ง ไม่ซ้ำสองบรรทัด", () => {
    const items = buildAdminNotifications({ ...quiet, deliveries: { overdue: 0, unshipped: 3, unclaimed: 2 } });
    assert.deepEqual(ids(items), ["delivery-open"]);
    assert.equal(items[0].level, "warning");
    assert.match(items[0].detail || "", /ยังไม่มีคนรับงาน 2 ใบ/);
  });

  it("กดส่งแล้วไม่มีข้อมูลในระบบ = ด่วน และบอกชื่อคนที่กด", () => {
    const items = buildAdminNotifications({
      ...quiet,
      pressesWithoutRecord: [
        { staffName: "Kongh", phaseTitle: "เปิดร้าน" },
        { staffName: "Kongh", phaseTitle: "Stock" },
        { staffName: "Boom", phaseTitle: "ปิดร้าน" }
      ]
    });
    assert.equal(items[0].id, "submit-lost");
    assert.equal(items[0].level, "urgent");
    assert.equal(items[0].count, 3);
    // ชื่อซ้ำต้องยุบเหลือครั้งเดียว
    assert.match(items[0].detail || "", /^Kongh, Boom/);
  });

  it("รวมทุกแหล่ง แล้วเรียงด่วนขึ้นก่อน", () => {
    const items = buildAdminNotifications({
      storageReady: true,
      deliveries: { overdue: 1, unshipped: 1, unclaimed: 0 },
      pressesWithoutRecord: [{ staffName: "Kongh", phaseTitle: "เปิดร้าน" }],
      assignments: { waitingReview: 2, overdue: 3 },
      handoffs: { open: 1 },
      checklist: { latePhases: 4, notStartedStaff: ["Leo"] },
      bugReports: { open: 5 },
      guild: noGuild
    });
    const levels = items.map((item) => item.level);
    assert.deepEqual([...levels].sort((a, b) => levels.indexOf(a) - levels.indexOf(b)), levels);
    assert.equal(levels[0], "urgent");
    assert.equal(levels[levels.length - 1], "info");
    assert.equal(items.length, 8);
  });

  it("ทุกแจ้งเตือนต้องมีที่ให้กดไปดูต่อ", () => {
    const items = buildAdminNotifications({
      storageReady: true,
      deliveries: { overdue: 1, unshipped: 1, unclaimed: 1 },
      pressesWithoutRecord: [{ staffName: "A", phaseTitle: "B" }],
      assignments: { waitingReview: 1, overdue: 1 },
      handoffs: { open: 1 },
      checklist: { latePhases: 1, notStartedStaff: ["C"] },
      bugReports: { open: 1 },
      guild: noGuild
    });
    for (const item of items) {
      assert.ok(item.href.length > 1, `${item.id} ต้องมี href`);
      assert.ok(item.title.length > 0, `${item.id} ต้องมีหัวข้อ`);
    }
    assert.equal(new Set(ids(items)).size, items.length, "id ต้องไม่ซ้ำ");
  });

  it("อ่านข้อมูลไม่ได้ ต้องเตือนก่อนเรื่องอื่นทั้งหมด", () => {
    const items = buildAdminNotifications({ ...quiet, storageReady: false, handoffs: { open: 3 } });
    assert.equal(items[0].id, "storage-down");
    assert.equal(items[0].level, "urgent");
  });

  it("เว็บกิลด์ทุกหมวดเป็น 0 ไม่ออกแจ้งเตือนกิลด์เลย", () => {
    assert.deepEqual(buildAdminNotifications({ ...quiet, guild: noGuild }), []);
  });

  it("เว็บกิลด์ออกแจ้งเตือนครบทุกหมวดที่มีค่า พร้อม href กิลด์และ count", () => {
    const items = buildAdminNotifications({
      ...quiet,
      guild: {
        expClaims: 3,
        questSubmissions: 2,
        shopRequests: 1,
        coinTopups: 4,
        mergeRequests: 1,
        guildShopOrders: 5,
        pendingMembers: 2
      }
    });
    assert.deepEqual(new Set(ids(items)), new Set([
      "guild-exp-claims",
      "guild-quest-submissions",
      "guild-shop-requests",
      "guild-coin-topups",
      "guild-merge-requests",
      "guild-shop-orders",
      "guild-pending-members"
    ]));
    for (const item of items) {
      assert.equal(item.source, "เว็บกิลด์");
      assert.equal(item.level, "warning");
      assert.equal(item.href, "https://guild.uplevelguild.com/admin");
      assert.ok((item.count ?? 0) > 0, `${item.id} ต้องมี count`);
    }
    // id ต้องไม่ซ้ำ แม้รวมกับแหล่งอื่น
    assert.equal(new Set(ids(items)).size, items.length);
  });

  it("เว็บกิลด์ออกเฉพาะหมวดที่ > 0 เท่านั้น", () => {
    const items = buildAdminNotifications({
      ...quiet,
      guild: { ...noGuild, expClaims: 2, guildShopOrders: 3 }
    });
    assert.deepEqual(ids(items).sort(), ["guild-exp-claims", "guild-shop-orders"]);
    const exp = items.find((item) => item.id === "guild-exp-claims");
    assert.match(exp?.title || "", /ขอเพิ่ม EXP รออนุมัติ 2/);
  });

  it("รวม SOP + เว็บกิลด์ ในหน้าเดียว id ไม่ซ้ำและทุกอันมี href", () => {
    const items = buildAdminNotifications({
      storageReady: true,
      deliveries: { overdue: 1, unshipped: 1, unclaimed: 0 },
      pressesWithoutRecord: [{ staffName: "Kongh", phaseTitle: "เปิดร้าน" }],
      assignments: { waitingReview: 2, overdue: 3 },
      handoffs: { open: 1 },
      checklist: { latePhases: 4, notStartedStaff: ["Leo"] },
      bugReports: { open: 5 },
      guild: {
        expClaims: 1,
        questSubmissions: 1,
        shopRequests: 1,
        coinTopups: 1,
        mergeRequests: 1,
        guildShopOrders: 1,
        pendingMembers: 1
      }
    });
    // 8 SOP + 7 กิลด์
    assert.equal(items.length, 15);
    assert.equal(new Set(ids(items)).size, items.length, "id ต้องไม่ซ้ำข้ามแหล่ง");
    for (const item of items) assert.ok(item.href.length > 1, `${item.id} ต้องมี href`);
  });
});

describe("sortNotifications / summariseNotifications", () => {
  const make = (id: string, level: AdminNotification["level"], count: number): AdminNotification => ({
    id,
    level,
    source: "s",
    title: id,
    href: "/x",
    count
  });

  it("ระดับเดียวกัน จำนวนมากขึ้นก่อน", () => {
    const sorted = sortNotifications([make("a", "warning", 1), make("b", "warning", 9)]);
    assert.deepEqual(ids(sorted), ["b", "a"]);
  });

  it("นับแยกตามระดับ", () => {
    const summary = summariseNotifications([make("a", "urgent", 1), make("b", "warning", 1), make("c", "info", 1)]);
    assert.deepEqual(summary, { total: 3, urgent: 1, warning: 1 });
  });

  it("หัวข้อสรุปอ่านรู้เรื่องทั้งตอนมีและไม่มีเรื่องค้าง", () => {
    assert.equal(notificationHeadline({ total: 0, urgent: 0, warning: 0 }), "ไม่มีเรื่องค้าง");
    assert.equal(notificationHeadline({ total: 5, urgent: 2, warning: 3 }), "ด่วน 2 · ต้องตาม 3");
    assert.equal(notificationHeadline({ total: 2, urgent: 0, warning: 0 }), "2 เรื่อง");
  });
});
