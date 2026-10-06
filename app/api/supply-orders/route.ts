import { NextResponse } from "next/server";
import { actor, badRequest, canWriteNow, forbidden, isAdmin, readOnly } from "../../../lib/api-firestore.ts";
import { hasAdminCredentials } from "../../../lib/firebase-admin.ts";
import {
  cancelSupplyOrder,
  checkSupplyItem,
  createSupplyOrder,
  finishReceiving,
  listSupplyOrders,
  notifyOwnerSupply,
  readOrderPhotos,
  reopenReceiving,
  supplyMismatchAlert,
  updateFollowUp,
  updateSupplyOrder,
  type FollowUpInput,
  type SupplyCreateInput
} from "../../../lib/supply-orders-server.ts";
import { bangkokDate, cleanNumber, parseSupplyCheck, problemItems, sortSupplyOrders } from "../../../lib/supply-orders.ts";

// ของเติมสต็อกที่สั่งไปแล้ว (น้ำ ขนม accessory) — คนละระบบกับพัสดุการ์ด /api/parcel-orders.
// GET = ออเดอร์ของสาขา (ไม่ส่ง branch = ทุกสาขา). พนักงานทุกคนลงออเดอร์/รับของ/ตามซัพได้
// (งานหน้าร้านหยิบแทนกันได้) · ยกเลิกออเดอร์ = เจ้าของร้าน หรือคนที่ลงออเดอร์นั้นเอง.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const { user, staffCode } = await actor();
  if (!hasAdminCredentials()) return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  const branch = new URL(request.url).searchParams.get("branch") || undefined;
  try {
    const orders = sortSupplyOrders(await listSupplyOrders({ branch }));
    return NextResponse.json({ orders, today: bangkokDate(new Date()), isAdmin: isAdmin(user), staffCode });
  } catch (error) {
    return NextResponse.json({ error: "read_failed", detail: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { user, staffCode } = await actor();
  if (!canWriteNow(user)) return readOnly();
  if (!hasAdminCredentials()) return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { action?: string; [k: string]: unknown } | null;
  if (!body || typeof body.action !== "string") return badRequest("missing_action");
  const str = (value: unknown) => (typeof value === "string" ? value : "");
  const by = staffCode || user.actualEmail;
  const id = str(body.id);
  const needsId = !["create", "read"].includes(body.action);
  if (needsId && (!id || id.includes("/"))) return badRequest("missing_id");

  const reply = (result: { error?: string; id?: string }) =>
    result.error
      ? NextResponse.json({ error: "rejected", detail: result.error }, { status: 400 })
      : NextResponse.json({ ok: true, ...(result.id ? { id: result.id } : {}) });

  try {
    switch (body.action) {
      case "read": {
        const photos = Array.isArray(body.photos) ? body.photos.filter((url): url is string => typeof url === "string") : [];
        const result = await readOrderPhotos(photos, str(body.branch) || "bangkae");
        if (result.error) return reply(result);
        return NextResponse.json({ ok: true, result: result.result });
      }
      case "create":
        return reply(await createSupplyOrder(body as SupplyCreateInput, by));
      case "update":
        return reply(await updateSupplyOrder(id, body as SupplyCreateInput));
      case "cancel": {
        if (!isAdmin(user)) {
          const mine = (await listSupplyOrders()).find((order) => order.id === id);
          if (!mine || mine.createdBy !== by) return forbidden();
        }
        return reply(await cancelSupplyOrder(id, body.cancelled !== false, by));
      }
      case "check": {
        const check = parseSupplyCheck(body.check);
        return reply(await checkSupplyItem(id, str(body.itemId), check, cleanNumber(body.receivedQty), str(body.note), by));
      }
      case "finish": {
        const result = await finishReceiving(id, { deliveryPhotos: body.deliveryPhotos, receiveNote: body.receiveNote }, by);
        if (!result.error && result.order && problemItems(result.order).length) {
          await notifyOwnerSupply(supplyMismatchAlert(result.order)).catch(() => undefined);
        }
        return reply(result);
      }
      case "reopen":
        return reply(await reopenReceiving(id));
      case "followUp":
        return reply(await updateFollowUp(id, body as FollowUpInput, by));
      default:
        return badRequest("unknown_action");
    }
  } catch (error) {
    return NextResponse.json({ error: "write_failed", detail: String(error) }, { status: 500 });
  }
}
