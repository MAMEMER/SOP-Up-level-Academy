import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "../../../../lib/firebase-admin.ts";
import { sopUserForEmail } from "../../../../lib/sop-users.ts";
import { SOP_SESSION_COOKIE, SOP_SESSION_EXPIRES_IN_MS as EXPIRES_IN_MS } from "../../../../lib/auth-session.ts";

// POST: exchange a Google ID token for a server session cookie. Rejects any email
// not on the SOP allow-list (sop-users.ts) so only staff/owners get a session.
export async function POST(request: Request) {
  const { idToken } = await request.json().catch(() => ({ idToken: null }));
  if (!idToken || typeof idToken !== "string") {
    return NextResponse.json({ error: "missing_id_token" }, { status: 400 });
  }

  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: "invalid_id_token" }, { status: 401 });
  }

  if (!sopUserForEmail(decoded.email)) {
    return NextResponse.json({ error: "not_allowed" }, { status: 403 });
  }

  const sessionCookie = await adminAuth().createSessionCookie(idToken, { expiresIn: EXPIRES_IN_MS });
  (await cookies()).set(SOP_SESSION_COOKIE, sessionCookie, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: EXPIRES_IN_MS / 1000
  });
  return NextResponse.json({ ok: true });
}

// DELETE: sign out — clear the session cookie.
export async function DELETE() {
  (await cookies()).delete(SOP_SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
