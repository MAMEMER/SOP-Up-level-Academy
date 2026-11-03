import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { verifySession } from "./session-jwt.ts";
import { sopUserForEmail } from "./sop-users.ts";
import { SOP_SESSION_COOKIE } from "./auth-session.ts";
import { ensureStaffLoaded } from "./staff-store.ts";

// Gate for routes called by Vercel Cron (Authorization: Bearer CRON_SECRET) or by a
// signed-in admin. The secret is accepted only in the header — a `?key=` query param
// leaks into access logs, history and referrers. Constant-time compare.
function bearerMatches(request: Request, secret: string): boolean {
  const got = Buffer.from(request.headers.get("authorization") || "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function isCronOrAdmin(request: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret && bearerMatches(request, secret)) return true;
  const cookie = (await cookies()).get(SOP_SESSION_COOKIE)?.value;
  if (!cookie) return false;
  const session = await verifySession(cookie);
  if (!session) return false;
  // Load the live staff list first so a demotion in /admin/staff takes effect here too.
  await ensureStaffLoaded();
  return sopUserForEmail(session.email)?.role === "admin";
}
