import "server-only";
import { NextResponse } from "next/server";
import { requireUser, type CurrentUser } from "./auth.ts";
import { employeeCodeForEmail } from "./employee-directory.ts";
import { adminDb } from "./firebase-admin.ts";
import type { Firestore } from "firebase-admin/firestore";

// Shared helpers for the authenticated server routes that replaced the client Firestore
// stores (fix 1). Every one of these collections used to be world read/write; now the
// browser calls these routes instead, they verify the SOP session, and the Admin SDK
// (service account) does the actual read/write — so the Firestore rules can be locked to
// server-only. The acting identity (updatedBy / assignedBy / by) is ALWAYS taken from the
// session here, never trusted from the request body.

export type Actor = {
  user: CurrentUser;
  /** the signed-in staffer's code, or "" for an account not in the employee directory */
  staffCode: string;
};

/** Resolves the signed-in user (redirects to /login when there is no session). */
export async function actor(): Promise<Actor> {
  const user = await requireUser();
  return { user, staffCode: employeeCodeForEmail(user.email) || "" };
}

export function db(): Firestore {
  return adminDb();
}

export const forbidden = () => NextResponse.json({ error: "forbidden" }, { status: 403 });
export const badRequest = (detail?: string) =>
  NextResponse.json({ error: "bad_request", ...(detail ? { detail } : {}) }, { status: 400 });
export const readOnly = () => NextResponse.json({ error: "read_only_view" }, { status: 403 });

/** Writes are blocked while an admin is impersonating a staffer (matches impersonation.ts). */
export function canWriteNow(user: CurrentUser): boolean {
  return !user.isImpersonating;
}

export function isAdmin(user: CurrentUser): boolean {
  return user.role === "admin";
}
