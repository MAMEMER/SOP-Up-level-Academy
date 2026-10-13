import "server-only";
import { NextResponse } from "next/server";
import { machineAuthStatus } from "./clip-briefs-key.ts";

// Mac mini (ตัวตัดคลิป) เรียก endpoint เหล่านี้ด้วย header `x-autocut-key` = env AUTOCUT_KEY.
// ไม่ได้ตั้ง env = ปิด endpoint ไว้ (503) แทนที่จะเปิดโล่ง.
export function machineAuthError(request: Request): NextResponse | null {
  const status = machineAuthStatus(request.headers.get("x-autocut-key"), process.env.AUTOCUT_KEY);
  if (status === 503) return NextResponse.json({ error: "autocut_key_not_configured" }, { status: 503 });
  if (status === 401) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return null;
}
