import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { SOP_SESSION_EXPIRES_IN_MS } from "./auth-session.ts";

// Our own signed session token (HS256), issued after a Google sign-in is verified once.
// Ongoing requests verify THIS token, so no per-request Google/Admin call is needed and
// nothing from firebase-admin is on the hot path. Secret = SESSION_SECRET (Vercel env).

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET not set");
  return new TextEncoder().encode(secret);
}

/** True when a session secret is configured (i.e. real auth mode / not local preview). */
export function hasSessionSecret(): boolean {
  return Boolean(process.env.SESSION_SECRET);
}

export type SessionClaims = { email: string; uid: string };

export async function mintSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ email: claims.email, uid: claims.uid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${Math.floor(SOP_SESSION_EXPIRES_IN_MS / 1000)}s`)
    .sign(secretKey());
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.email !== "string" || typeof payload.uid !== "string") return null;
    return { email: payload.email, uid: payload.uid };
  } catch {
    return null;
  }
}
