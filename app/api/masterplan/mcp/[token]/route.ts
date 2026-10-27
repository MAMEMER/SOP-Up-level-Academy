import { NextResponse } from "next/server";
import { mpStore } from "../../../../../lib/masterplan-store.ts";
import { NO_STORE_HEADERS, gateToken } from "../../../../../lib/masterplan-token-route.ts";
import { RPC, handleBody, rpcError } from "../../../../../lib/masterplan-mcp.ts";

// Masterplan MCP server for a Claude custom connector (Streamable HTTP, stateless, JSON
// responses only). claude.ai connectors take just a URL, so the per-person token is in the
// path. Invalid / revoked token → 404, not 401: a 401 makes claude.ai start an OAuth sign-in
// that this server does not have ("Couldn't register with … sign-in service").

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE_HEADERS });

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const gate = await gateToken(token);
  if (!gate.ok) {
    return gate.status === 401
      ? json(rpcError(null, RPC.UNAUTHORIZED, "ลิงก์นี้ใช้ไม่ได้หรือถูกยกเลิกแล้ว สร้างลิงก์ใหม่ที่ sop.uplevelguild.com/masterplan/ai"), 404)
      : json(rpcError(null, -32000, "Rate limit exceeded — slow down"), 429);
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 1_000_000) return json(rpcError(null, RPC.INVALID_REQUEST, "Request too large"), 413);
    body = JSON.parse(text);
  } catch {
    return json(rpcError(null, RPC.PARSE, "Parse error"), 400);
  }

  const { member, token: record } = gate.verified;
  const { responses } = await handleBody(body, { member, tokenLabel: record.label, store: mpStore });
  if (responses === null) return new NextResponse(null, { status: 202, headers: NO_STORE_HEADERS });
  return json(responses);
}

// Stateless server: no server-initiated SSE stream, no sessions to delete.
const notAllowed = () => new NextResponse(null, { status: 405, headers: { ...NO_STORE_HEADERS, Allow: "POST" } });
export const GET = notAllowed;
export const DELETE = notAllowed;
