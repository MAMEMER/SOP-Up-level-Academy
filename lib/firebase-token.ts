import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";

// Verifies a Firebase (Google) ID token WITHOUT the firebase-admin SDK — the Admin SDK
// has native / dynamic-require deps that don't bundle cleanly on Vercel serverless.
// Firebase ID tokens are standard RS256 JWTs signed by Google's securetoken service;
// jose verifies them against Google's published JWK set. Only the sign-in exchange
// uses this (once); ongoing sessions use our own session JWT (session-jwt.ts).

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "up-level-guild";

const jwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

export type VerifiedGoogleUser = { email: string; uid: string };

export async function verifyGoogleIdToken(idToken: string): Promise<VerifiedGoogleUser | null> {
  try {
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID
    });
    const email = typeof payload.email === "string" ? payload.email : undefined;
    const uid = (typeof payload.user_id === "string" ? payload.user_id : undefined) || (payload.sub as string | undefined);
    if (!email || !uid) return null;
    return { email, uid };
  } catch {
    return null;
  }
}
