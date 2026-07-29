import "server-only";
import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

// Server-side Firestore with the service account. Used for the work-record store so the
// employee identity on every write comes from the session cookie (not the client) and so
// the collection needs no `allow write: if true` rule in the shared guild ruleset.
// Env: FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY (Vercel).

const APP_NAME = "sop-admin";

// Same bucket the client uses; evidence uploads now go through the admin SDK so they
// authorize off the SOP session cookie instead of a live Firebase Auth session (which
// the 14-day session cookie routinely outlives — the cause of "ต้อง login Google ก่อน").
const STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET ||
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
  "up-level-guild.firebasestorage.app";

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
      }),
      storageBucket: STORAGE_BUCKET
    },
    APP_NAME
  );
}

export function adminDb(): Firestore {
  if (!hasAdminCredentials()) throw new Error("Firebase admin credentials are not configured");
  return getFirestore(adminApp());
}

export const adminStorageBucket = STORAGE_BUCKET;

/** Storage bucket via the service account — bypasses client Firebase Auth for uploads. */
export function adminBucket() {
  if (!hasAdminCredentials()) throw new Error("Firebase admin credentials are not configured");
  return getStorage(adminApp()).bucket(STORAGE_BUCKET);
}
