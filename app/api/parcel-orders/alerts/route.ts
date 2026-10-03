import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "../../../../lib/session-jwt.ts";
import { sopUserForEmail } from "../../../../lib/sop-users.ts";
import { SOP_SESSION_COOKIE } from "../../../../lib/auth-session.ts";
import { hasAdminCredentials } from "../../../../lib/firebase-admin.ts";
import { sendOwnerParcelAlerts } from "../../../../lib/parcel-orders-server.ts";

// Vercel Cron เช้า+เย็น: พัสดุการ์ดที่เกิน 5 วันยังไม่ถึง / ถึงแล้วแอดมินยังไม่ลง / ของไม่ตรง
// → ส่ง Telegram ให้แชมป์ผ่าน Vera (วันละครั้งต่อออเดอร์). gate เดียวกับ sync-shop.

export const dynamic = "force-dynamic";

async function isAllowed(request: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return true;
  const cookie = (await cookies()).get(SOP_SESSION_COOKIE)?.value;
  if (!cookie) return false;
  const session = await verifySession(cookie);
  const user = session ? sopUserForEmail(session.email) : undefined;
  return user?.role === "admin";
}

export async function GET(request: Request) {
  if (!(await isAllowed(request))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!hasAdminCredentials()) return NextResponse.json({ error: "firebase_not_configured" }, { status: 503 });
  try {
    return NextResponse.json({ ok: true, ...(await sendOwnerParcelAlerts()) });
  } catch (error) {
    return NextResponse.json({ error: "alert_failed", detail: String(error) }, { status: 500 });
  }
}
