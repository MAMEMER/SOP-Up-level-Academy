import { NextResponse, type NextRequest } from "next/server";

// CSRF guard for JSON API writes. The session cookie is SameSite=Lax, and every
// *.uplevelguild.com subdomain counts as same-site, so an XSS on a sibling app could
// otherwise POST here with the staffer's cookie. Browsers always send Origin on
// cross-origin writes; server-to-server callers (Vercel cron, LINE webhook, owner app)
// send none and are authenticated by their own secrets. Server actions already get
// Next's built-in Origin check, so only /api is covered here.
const TOKEN_ROUTES = ["/api/masterplan/mcp/", "/api/masterplan/read"];

export function proxy(request: NextRequest) {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return NextResponse.next();
  const { pathname, host } = request.nextUrl;
  if (TOKEN_ROUTES.some((p) => pathname.startsWith(p))) return NextResponse.next();
  const origin = request.headers.get("origin");
  if (!origin) return NextResponse.next();
  let originHost = "";
  try { originHost = new URL(origin).host; } catch { /* malformed → reject below */ }
  const expected = request.headers.get("x-forwarded-host") || request.headers.get("host") || host;
  if (originHost && originHost === expected) return NextResponse.next();
  return NextResponse.json({ error: "cross_origin_forbidden" }, { status: 403 });
}

export const config = { matcher: ["/api/:path*"] };
