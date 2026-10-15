import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
const rows: Record<string, Array<Record<string, unknown>>> = {
  "shop-orders": [{ id: "old", status: "confirmed", createdAt: "2026-10-15T01:00:00Z" }, { id: "gone", status: "confirmed", removed: true, removedBy: "UP-001", removedAt: "2026-10-15T08:00:00Z", removedReason: "duplicate" }],
  "delivery_tasks": [{ id: "task", orderId: "gone", branch: "senafest", status: "open", paidWorkDate: "2026-10-15" }, { id: "gone-task", orderId: "old", branch: "senafest", status: "open", removed: true }],
  "set14-reservations": [{ id: "r", removed: true, removedReason: "cancel", status: "confirmed", nickname: "test", total: 100, qty: 1 }]
};
let creates = 0;
const projections: string[][] = [];
const docs = (name: string) => (rows[name] || []).map((row) => ({ id: String(row.id), exists: true, data: () => row }));
const database = {
  collection: (name: string) => {
    const query = { select: (...fields: string[]) => { projections.push(fields); return query; }, where: (..._args: unknown[]) => query, get: async () => ({ docs: docs(name) }), doc: (id: string) => ({ name, id, create: async () => { creates++; } }) };
    return query;
  },
  getAll: async (...refs: Array<{ name?: string; id?: string }>) => refs.filter((ref) => ref.id).map((ref) => {
    const row = (rows[ref.name!] || []).find((row) => row.id === ref.id);
    return { id: ref.id, exists: !!row, data: () => row };
  })
};
Object.assign(globalThis, { gbRemovalTest: { database } });
const hooks = registerHooks({ resolve(specifier, context, next) {
  let source: string | undefined;
  if (context.parentURL?.endsWith("/admin-notifications-server.ts")) {
    if (specifier.endsWith("delivery-tasks-server.ts")) source = "export const syncDeliveryTasks=async()=>[]";
    if (specifier.endsWith("parcel-orders-server.ts")) source = "export const listParcelOrders=async()=>[]";
    if (specifier.endsWith("firestore-rest.ts")) source = "export const restListCollection=async()=>[]";
    if (specifier.endsWith("work-records-store.ts")) source = "export const listRecordsForScopeKey=async()=>[]";
  }
  if (specifier === "server-only") source = "export {}";
  if (specifier.endsWith("firebase-admin.ts")) source = "export const adminDb=()=>globalThis.gbRemovalTest.database; export const hasAdminCredentials=()=>true";
  if (specifier === "google-auth-library") source = "export class JWT {async getAccessToken(){throw Error('sheets disabled in unit test')}}";
  return source ? { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true } : next(specifier, context);
} });
const { fetchCustomerOrders, invalidateOrders } = await import("../lib/customer-orders-server.ts");
const { syncDeliveryTasks, fetchDeliveryTasks } = await import("../lib/delivery-tasks-server.ts");
const { getAdminNotifications } = await import("../lib/admin-notifications-server.ts");
hooks.deregister();
test("order feed filters before returning, preserves audits on opt-in, and cache never leaks removed rows", async () => {
  invalidateOrders();
  const normal = await fetchCustomerOrders();
  assert.deepEqual(normal.orders.map((o) => o.key), ["shop__old"]);
  const audit = await fetchCustomerOrders(true);
  assert.ok(audit.orders.some((o) => o.key === "shop__gone" && o.removedReason === "duplicate"));
  assert.deepEqual((await fetchCustomerOrders()).orders, normal.orders);
  rows["shop-orders"][1].removed = false;
  invalidateOrders();
  assert.ok((await fetchCustomerOrders()).orders.some((o) => o.key === "shop__gone"));
  rows["shop-orders"][1].removed = true;
});
test("delivery reads hide removed tasks and tasks of removed orders; audit toggle retains metadata and sync never recreates removed tasks", async () => {
  const now = new Date("2026-10-15T10:00:00+07:00");
  assert.deepEqual(await syncDeliveryTasks(now), []);
  assert.deepEqual(await fetchDeliveryTasks("senafest", now), []);
  const audit = await syncDeliveryTasks(now, true);
  assert.equal(audit.length, 2);
  assert.equal(audit.find((task) => task.id === "task")?.removedReason, "duplicate");
  assert.equal(creates, 0);
});

test("Admin Hub pending counts include old/restored records and exclude removed with a field-only projection", async () => {
  for (const name of ["users", "coin_topups", "shop_orders", "quest_submissions", "shop_requests", "merge_requests", "activity_claims"]) {
    rows[name] = [{ id: "old" }, { id: "restored", removed: false }, { id: "gone", removed: true }];
  }
  projections.length = 0;
  const notifications = await getAdminNotifications([], "2026-10-15", []);
  const guild = notifications.filter((item) => item.id.startsWith("guild-"));
  assert.equal(guild.length, 7);
  assert.ok(guild.every((item) => item.count === 2));
  assert.equal(projections.length, 7);
  assert.ok(projections.every((fields) => fields.length === 1 && fields[0] === "removed"));
});
