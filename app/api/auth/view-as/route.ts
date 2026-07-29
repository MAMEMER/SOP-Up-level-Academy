import { NextResponse } from "next/server";
import { requireActualUser } from "../../../../lib/auth.ts";
import { sopUserForEmail } from "../../../../lib/sop-users.ts";
import { VIEW_AS_COOKIE, VIEW_AS_EXPIRES_IN_MS, canImpersonate } from "../../../../lib/impersonation.ts";

// Owner/admin "ดูในมุมมองพนักงาน" switch. Sets a cookie that requireUser() resolves into
// the impersonated identity. Read-only — see lib/impersonation.ts.

export async function POST(request: Request) {
  const actor = await requireActualUser();
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const target = sopUserForEmail(body?.email);

  if (!target) return NextResponse.json({ error: "unknown_user" }, { status: 404 });
  if (!canImpersonate(actor.role, target.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true, viewingAs: target.email });
  response.cookies.set(VIEW_AS_COOKIE, target.email, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(VIEW_AS_EXPIRES_IN_MS / 1000)
  });
  return response;
}

export async function DELETE() {
  await requireActualUser();
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(VIEW_AS_COOKIE);
  return response;
}
