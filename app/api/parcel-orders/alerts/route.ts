import { NextResponse } from "next/server";
import { isCronOrAdmin } from "../../../../lib/cron-auth.ts";
import { hasAdminCredentials } from "../../../../lib/firebase-admin.ts";
import { sendOwnerParcelAlerts } from "../../../../lib/parcel-orders-server.ts";

// Vercel Cron เช้า+เย็น: พัสดุการ์ดที่เกิน 5 วันยังไม่ถึง / ถึงแล้วแอดมินยังไม่ลง / ของไม่ตรง
// → ส่ง Telegram ให้แชมป์ผ่าน Vera (วันละครั้งต่อออเดอร์). gate เดียวกับ sync-shop.

export const dynamic = "force-dynamic";

async function isAllowed(request: Request): Promise<boolean> {
  return isCronOrAdmin(request);
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
