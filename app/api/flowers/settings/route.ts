import { NextResponse } from "next/server";
import { actor, badRequest, canWriteNow, forbidden, readOnly } from "../../../../lib/api-firestore.ts";
import { hasAdminCredentials } from "../../../../lib/firebase-admin.ts";
import { isOwner } from "../../../../lib/owner.ts";
import { getFlowerMonth, saveFlowerTarget } from "../../../../lib/flower-target-server.ts";

// เป้าดอกไม้ขั้นต่ำ — เจ้าของเท่านั้นที่แก้ได้ (ยอดขายทั้งร้านเป็นตัวเลขชั้นเจ้าของ)

export const dynamic = "force-dynamic";

export async function GET() {
  const { user } = await actor();
  if (!isOwner(user.actualEmail)) return forbidden();
  return NextResponse.json(await getFlowerMonth());
}

export async function PUT(request: Request) {
  const { user } = await actor();
  if (!isOwner(user.actualEmail)) return forbidden();
  if (!canWriteNow(user)) return readOnly();
  if (!hasAdminCredentials()) return NextResponse.json({ error: "no_credentials" }, { status: 503 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest();
  await saveFlowerTarget(body, user.actualEmail);
  return NextResponse.json(await getFlowerMonth());
}
