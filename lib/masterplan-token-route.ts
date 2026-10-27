import "server-only";
import { mpStore } from "./masterplan-store.ts";
import { createRateLimiter, hashToken, touchToken, verifyToken, type VerifiedToken } from "./masterplan-tokens.ts";

// Shared gate for the token-authenticated routes (MCP connector + read link). These routes
// do NOT use the session cookie: the token in the path is the credential, and it can only
// reach what lib/masterplan-mcp.ts exposes.

const limited = createRateLimiter(60, 60_000);

export type TokenGate = { ok: true; verified: VerifiedToken } | { ok: false; status: 401 | 429 };

export async function gateToken(raw: string): Promise<TokenGate> {
  const verified = await verifyToken(mpStore, raw);
  if (!verified) return { ok: false, status: 401 };
  if (limited(hashToken(raw))) return { ok: false, status: 429 };
  // best-effort; never fail the request over a lastUsedAt write
  await touchToken(mpStore, verified.token).catch(() => undefined);
  return { ok: true, verified };
}

export const NO_STORE_HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
