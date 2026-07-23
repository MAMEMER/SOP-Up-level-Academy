import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// Server-side Firebase Admin for the SOP site. Reuses the shared up-level-guild
// service account (same FIREBASE_* env as the guild web app) to verify Google
// sign-in session cookies. When the credentials are absent (local dev), the app
// falls back to a preview admin user — see lib/auth.ts.

let app: App | undefined;

function adminApp(): App {
  if (app) return app;
  if (getApps().length) {
    app = getApps()[0];
    return app;
  }
  app = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Vercel stores the PEM with literal \n — restore real newlines.
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")
    })
  });
  return app;
}

export function adminAuth() {
  return getAuth(adminApp());
}

/** True when the Firebase Admin service account is configured (i.e. real auth mode). */
export function hasAdminCredentials(): boolean {
  return Boolean(process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID);
}
