import "server-only";
import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

// Server-side Firestore with the service account. Used for the work-record store so the
// employee identity on every write comes from the session cookie (not the client) and so
// the collection needs no `allow write: if true` rule in the shared guild ruleset.
// Env: FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY (Vercel).

const APP_NAME = "sop-admin";

export function hasAdminCredentials(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY
  );
}

function adminApp(): App {
  const existing = getApps().find((app) => app.name === APP_NAME);
  if (existing) return getApp(APP_NAME);

  return initializeApp(
    {
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Vercel stores the key with literal \n sequences.
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n")
      })
    },
    APP_NAME
  );
}

export function adminDb(): Firestore {
  if (!hasAdminCredentials()) throw new Error("Firebase admin credentials are not configured");
  return getFirestore(adminApp());
}
