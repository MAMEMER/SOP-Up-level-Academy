import { createHash, timingSafeEqual } from "node:crypto";

// ตรวจ x-autocut-key ของ Mac mini — แยกไฟล์จาก clip-briefs.ts เพราะไฟล์นั้นถูก import ฝั่ง browser ด้วย

/** เทียบ key แบบเวลาคงที่ (hash ก่อนเพื่อให้ยาวเท่ากันเสมอ ไม่รั่วความยาว) */
export function keysMatch(provided: string | null | undefined, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** สถานะการตรวจ key ของเครื่อง: env ไม่ตั้ง = 503, ผิด = 401 */
export function machineAuthStatus(provided: string | null | undefined, envKey: string | undefined): 200 | 401 | 503 {
  if (!envKey) return 503;
  return keysMatch(provided, envKey) ? 200 : 401;
}
