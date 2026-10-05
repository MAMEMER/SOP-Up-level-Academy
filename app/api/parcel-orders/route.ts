import { NextResponse } from "next/server";
import { actor, badRequest, canWriteNow, forbidden, isAdmin, readOnly } from "../../../lib/api-firestore.ts";
import { hasAdminCredentials } from "../../../lib/firebase-admin.ts";
import {
  cancelParcelOrder,
  checkItem,
  createParcelOrder,
  createUnmatchedParcel,
  matchParcel,
  createVideoUploadSession,
  listParcelOrders,
  markArrivedByOwner,
  markArrivedWithVideo,
  notifyOwner,
  problemAlertText,
  reportProblem,
  resolveProblem,
  storeItem,
  unmatchedAlertText,
  updateParcelOrder,
  type ParcelCreateInput,
  type UnmatchedParcelInput
} from "../../../lib/parcel-orders-server.ts";
import { bangkokDate, openProblems, sortParcels, type ParcelCheck } from "../../../lib/parcel-orders.ts";

// พัสดุการ์ดที่สั่งซื้อ. GET = ออเดอร์ของสาขา (ไม่ส่ง branch = ทุกสาขา).
// เจ้าของร้าน (role admin) สร้าง/แก้/ยกเลิก/ปิดปัญหา · พนักงานทุกคนรับพัสดุ-เช็ค-ลง/แจ้งปัญหา
// (งานหน้าร้านหยิบแทนกันได้). ตัวตนมาจาก session เสมอ ไม่เชื่อ body.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user, staffCode } = await actor();
  if (!hasAdminCredentials()) return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  const branch = new URL(request.url).searchParams.get("branch") || undefined;
  const today = bangkokDate(new Date());
  try {
    const orders = sortParcels(await listParcelOrders({ branch }), today);
    return NextResponse.json({ orders, today, isAdmin: isAdmin(user), staffCode });
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
  const admin = isAdmin(user);
  const id = str(body.id);
  if (body.action !== "create" && body.action !== "receiveUnmatched" && (!id || id.includes("/"))) return badRequest("missing_id");

  const reply = (result: { error?: string; id?: string }) =>
    result.error
      ? NextResponse.json({ error: "rejected", detail: result.error }, { status: 400 })
      : NextResponse.json({ ok: true, ...(result.id ? { id: result.id } : {}) });

  try {
    switch (body.action) {
      case "create":
        if (!admin) return forbidden();
        return reply(await createParcelOrder(body as ParcelCreateInput, by));
      case "update":
        if (!admin) return forbidden();
        return reply(await updateParcelOrder(id, body as ParcelCreateInput));
      case "cancel":
        if (!admin) return forbidden();
        return reply(await cancelParcelOrder(id, body.cancelled !== false, by));
      case "arrivedByOwner":
        if (!admin) return forbidden();
        return reply(await markArrivedByOwner(id, str(body.arrivedDate), by));
      case "match":
        if (!admin) return forbidden();
        return reply(await matchParcel(id, str(body.targetId)));
      // ของมาก่อนออเดอร์ — พนักงานคนไหนก็ลงได้ แล้วเตือนเจ้าของร้านทันที
      case "receiveUnmatched": {
        const result = await createUnmatchedParcel(body as UnmatchedParcelInput, by);
        if (result.order) await notifyOwner(unmatchedAlertText(result.order)).catch(() => undefined);
        return reply(result);
      }
      case "resolveProblem":
        if (!admin) return forbidden();
        return reply(await resolveProblem(id, Number(body.index), str(body.resolution), by));

      case "videoUploadUrl": {
        const origin = request.headers.get("origin") || new URL(request.url).origin;
        const result = await createVideoUploadSession(id, str(body.contentType), Number(body.size), origin);
        if (result.error) return reply(result);
        return NextResponse.json({ ok: true, uploadUrl: result.uploadUrl, path: result.path });
      }
      case "arrived":
        return reply(await markArrivedWithVideo(id, str(body.path), by));
      case "check": {
        const raw = str(body.check);
        const check: ParcelCheck | null = raw === "ok" || raw === "wrong" || raw === "missing" ? raw : null;
        const result = await checkItem(id, str(body.itemId), check, str(body.note), by);
        if (!result.error && check && check !== "ok" && result.order) {
          const problem = openProblems(result.order).at(-1);
          if (problem) await notifyOwner(problemAlertText(result.order, problem)).catch(() => undefined);
        }
        return reply(result);
      }
      case "store":
        return reply(await storeItem(id, str(body.itemId), body.stored !== false, by));
      case "problem": {
        const result = await reportProblem(id, str(body.note), by);
        if (!result.error && result.order) {
          const problem = openProblems(result.order).at(-1);
          if (problem) await notifyOwner(problemAlertText(result.order, problem)).catch(() => undefined);
        }
        return reply(result);
      }
      default:
        return badRequest("unknown_action");
    }
  } catch (error) {
    return NextResponse.json({ error: "write_failed", detail: String(error) }, { status: 500 });
  }
}
