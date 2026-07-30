import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "../../../../lib/session-jwt.ts";
import { SOP_SESSION_COOKIE } from "../../../../lib/auth-session.ts";
import { fetchSupplyNeeds, hasSupplyNeedsFeed } from "../../../../lib/storehub-supply-needs.ts";

// ดึงรายการสินค้าใกล้หมดจาก StoreHub Supply Needs feed แล้วส่งให้ SOP แสดงเป็นแจ้งเตือน
// พนักงานเห็นรายการที่ต้องสั่งได้เลย โดยไม่ต้อง copy CSV มาวางเอง.
// ต้อง login (session ใดก็ได้) — ข้อมูลเป็นแค่ชื่อสินค้า + จำนวนคงเหลือ ทุก role ใช้ได้.

async function isLoggedIn(): Promise<boolean> {
  const cookie = (await cookies()).get(SOP_SESSION_COOKIE)?.value;
  if (!cookie) return false;
  return Boolean(await verifySession(cookie));
}

export async function GET(request: Request) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!hasSupplyNeedsFeed()) {
    return NextResponse.json({ error: "supply_needs_not_configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const thresholdParam = Number(url.searchParams.get("threshold"));
  const threshold = Number.isFinite(thresholdParam) && thresholdParam > 0 ? thresholdParam : undefined;

  try {
    const result = await fetchSupplyNeeds(threshold);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: "fetch_failed", detail: String(error) }, { status: 502 });
  }
}
