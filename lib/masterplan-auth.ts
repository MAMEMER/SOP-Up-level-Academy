import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { SOP_SESSION_COOKIE } from "./auth-session.ts";
import { memberByKey, memberForEmail, type MasterplanMember } from "./masterplan-access.ts";
import { hasSessionSecret, verifySession } from "./session-jwt.ts";

// Guard for every /masterplan page and /api/masterplan route. Verifies the same signed
// session cookie the SOP uses, then checks MASTERPLAN_MEMBERS — NOT the SOP allow-list,
// so ท้อป (Masterplan-only) gets in here and nowhere else. Impersonation (view-as) is
// deliberately ignored: the identity here is always the real signed-in account.
// Local dev (no SESSION_SECRET) previews as แชมป์, the same way requireUser() does.

type Resolution = { member: MasterplanMember } | { member: null; reason: "no_session" | "not_member" };

async function resolveMember(): Promise<Resolution> {
  if (!hasSessionSecret()) {
    const champ = memberByKey("champ");
    return champ ? { member: champ } : { member: null, reason: "not_member" };
  }
  const cookie = (await cookies()).get(SOP_SESSION_COOKIE)?.value;
  if (!cookie) return { member: null, reason: "no_session" };
  const session = await verifySession(cookie);
  if (!session) return { member: null, reason: "no_session" };
  const member = memberForEmail(session.email);
  return member ? { member } : { member: null, reason: "not_member" };
}

/** For pages: the signed-in Masterplan member, or a redirect to /login. */
export async function requireMasterplanMember(): Promise<MasterplanMember> {
  const resolved = await resolveMember();
  if (resolved.member) return resolved.member;
  if (resolved.reason === "no_session") redirect("/login?next=%2Fmasterplan");
  redirect("/login?denied=1");
}

/** For API routes: the member, or a 401/403 JSON response to return as-is. */
export async function masterplanApiMember(): Promise<{ member: MasterplanMember; error?: undefined } | { member?: undefined; error: NextResponse }> {
  const resolved = await resolveMember();
  if (resolved.member) return { member: resolved.member };
  return resolved.reason === "no_session"
    ? { error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) }
    : { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
}
