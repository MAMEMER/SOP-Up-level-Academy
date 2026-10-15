import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { actor, badRequest, canWriteNow, forbidden, isAdmin, readOnly } from "../../../lib/api-firestore.ts";
import { hasAdminCredentials } from "../../../lib/firebase-admin.ts";
import { displayNameFor } from "../../../lib/employee-directory.ts";
import { DEFAULT_LOT, type LotState, type OrderSource } from "../../../lib/customer-orders.ts";
import {
  fetchCustomerOrders,
  isOrderKey,
  recordHandover,
  setSourceLot,
  undoHandover
} from "../../../lib/customer-orders-server.ts";

// ออเดอร์ลูกค้าทุกช่องทาง. GET = รายการทั้งหมด (พนักงานทุกคน — ต้องใช้ตอนลูกค้ามารับของ)
// POST hand / undo = พนักงานบันทึกการส่งมอบ · lot = เจ้าของร้านตั้งสถานะล็อต (ยังไม่ถึง / ต้องส่งมอบ / ปิดล็อต).
// ไม่เขียนกลับไปที่ชีตหรือออเดอร์ต้นทาง. ตัวตนมาจาก session เสมอ.

export const dynamic = "force-dynamic";

/** แอป Up Level Owner (ผ่านเว็บกิลด์) อ่านรายการเดียวกันด้วยกุญแจลับ — อ่านอย่างเดียว */
function ownerAppKeyOk(request: Request): boolean {
  const expected = process.env.OWNER_ORDERS_KEY || "";
  const got = request.headers.get("x-owner-orders-key") || "";
  if (expected.length < 32 || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

export async function GET(request: Request) {
  if (request.headers.has("x-owner-orders-key")) {
    if (!ownerAppKeyOk(request)) return forbidden();
    return NextResponse.json(await fetchCustomerOrders());
  }
  const { user } = await actor();
  if (!hasAdminCredentials()) return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  try {
    return NextResponse.json({ ...(await fetchCustomerOrders()), isAdmin: isAdmin(user), canAct: canWriteNow(user) });
  } catch (error) {
    return NextResponse.json({ error: "read_failed", detail: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { user, staffCode } = await actor();
  if (!canWriteNow(user)) return readOnly();
  if (!hasAdminCredentials()) return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") return badRequest("missing_action");
  const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const by = staffCode || user.actualEmail;
  const byName = staffCode ? displayNameFor(staffCode) : "เจ้าของร้าน";

  try {
    if (body.action === "lot") {
      if (!isAdmin(user)) return forbidden();
      const source = str(body.source) as OrderSource;
      const lot = str(body.lot) as LotState;
      if (!(source in DEFAULT_LOT) || !["waiting", "open", "closed"].includes(lot)) return badRequest("bad_lot");
      await setSourceLot(source, lot, by);
      return NextResponse.json({ ok: true });
    }
    const key = str(body.key, 120);
    if (!isOrderKey(key)) return badRequest("bad_key");
    if (body.action === "undo") {
      await undoHandover(key, by, byName);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "hand") {
      const state = str(body.state);
      if (state !== "picked_up" && state !== "shipped" && state !== "partial") return badRequest("bad_state");
      const note = str(body.note, 300);
      if (state === "partial" && !note) return badRequest("note_required");
      await recordHandover(key, { state, tracking: str(body.tracking, 60), note }, by, byName);
      return NextResponse.json({ ok: true });
    }
    return badRequest("unknown_action");
  } catch (error) {
    return NextResponse.json({ error: "write_failed", detail: String(error) }, { status: 500 });
  }
}
