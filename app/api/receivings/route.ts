import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { actor, badRequest, canWriteNow, forbidden, isAdmin, readOnly } from "../../../lib/api-firestore.ts";
import { isOwner } from "../../../lib/owner.ts";
import { allBranchKeys } from "../../../lib/store-config.ts";
import {
  STATUS_PENDING,
  applyCostEdits,
  parseReceivingInput,
  recentDealers,
  redactForViewer,
  type ReceivingInput
} from "../../../lib/receivings.ts";
import {
  cancelAndRecompute,
  confirmAndApply,
  getReceiving,
  listReceivings,
  putReceiving,
  receivingsMode
} from "../../../lib/receivings-store.ts";

// รับของเข้า. Admin role only. Unit costs are money-sensitive → only isOwner() (checked on the
// signed-in account, not a view-as target) can see them, set them, confirm or cancel.
// Identity always comes from the session, never the body.

export const dynamic = "force-dynamic";

export async function GET() {
  const { user } = await actor();
  if (!isAdmin(user)) return forbidden();
  const owner = isOwner(user.actualEmail) && !user.isImpersonating;
  try {
    const all = await listReceivings();
    return NextResponse.json({
      receivings: all.map((r) => redactForViewer(r, owner)),
      dealers: recentDealers(all),
      isOwner: owner,
      storage: receivingsMode()
    });
  } catch (error) {
    return NextResponse.json({ error: "read_failed", detail: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { user, staffCode } = await actor();
  if (!isAdmin(user)) return forbidden();
  if (!canWriteNow(user)) return readOnly();
  if (receivingsMode() === "unavailable") return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  const owner = isOwner(user.actualEmail);
  const by = staffCode || user.actualEmail;

  const body = (await request.json().catch(() => null)) as ({ action?: string; id?: string } & Record<string, unknown>) | null;
  if (!body || typeof body.action !== "string") return badRequest("missing_action");
  const reject = (detail: string) => NextResponse.json({ error: "rejected", detail }, { status: 400 });

  try {
    if (body.action === "create") {
      const parsed = parseReceivingInput(body as ReceivingInput, { owner, branches: allBranchKeys() });
      if ("error" in parsed) return reject(parsed.error);
      const id = `${parsed.value.date}-${randomUUID().slice(0, 8)}`;
      await putReceiving({ ...parsed.value, id, status: STATUS_PENDING, createdBy: by, createdAt: Date.now() });
      return NextResponse.json({ ok: true, id });
    }

    // everything below touches cost → owner only
    if (!owner) return forbidden();
    const id = typeof body.id === "string" ? body.id : "";
    if (!id || id.includes("/")) return badRequest("missing_id");

    switch (body.action) {
      case "setCosts": {
        const current = await getReceiving(id);
        if (!current) return reject("ไม่พบรายการ");
        const edited = applyCostEdits(current, Array.isArray(body.costs) ? body.costs : []);
        if ("error" in edited) return reject(edited.error);
        await putReceiving(edited.receiving);
        return NextResponse.json({ ok: true });
      }
      case "confirm": {
        const result = await confirmAndApply(id, by);
        if (result.error) return reject(result.error);
        return NextResponse.json({ ok: true, alreadyApplied: Boolean(result.alreadyApplied) });
      }
      case "cancel": {
        const result = await cancelAndRecompute(id, typeof body.reason === "string" ? body.reason : "", by);
        if (result.error) return reject(result.error);
        return NextResponse.json({ ok: true });
      }
      default:
        return badRequest("unknown_action");
    }
  } catch (error) {
    return NextResponse.json({ error: "write_failed", detail: String(error) }, { status: 500 });
  }
}
