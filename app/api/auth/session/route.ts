import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyGoogleIdToken } from "../../../../lib/firebase-token.ts";
import { mintSession } from "../../../../lib/session-jwt.ts";
import { sopUserForEmail } from "../../../../lib/sop-users.ts";
import { SOP_SESSION_COOKIE, SOP_SESSION_EXPIRES_IN_MS as EXPIRES_IN_MS } from "../../../../lib/auth-session.ts";

// POST: verify a Google ID token, check the SOP allow-list, and issue our own session
// cookie (jose HS256 — no firebase-admin). Rejects any email not on the allow-list.
export async function POST(request: Request) {
  const { idToken } = await request.json().catch(() => ({ idToken: null }));
  if (!idToken || typeof idToken !== "string") {
    return NextResponse.json({ error: "missing_id_token" }, { status: 400 });
  }

  const verified = await verifyGoogleIdToken(idToken);
  if (!verified) {
    return NextResponse.json({ error: "invalid_id_token" }, { status: 401 });
  }

  if (!sopUserForEmail(verified.email)) {
    return NextResponse.json({ error: "not_allowed" }, { status: 403 });
  }

  const session = await mintSession({ email: verified.email, uid: verified.uid });
  (await cookies()).set(SOP_SESSION_COOKIE, session, {
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
