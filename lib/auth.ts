import { verifyGoogleIdToken } from "./firebase-token.ts";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { Role } from "./permissions.ts";
import { hasSessionSecret, verifySession } from "./session-jwt.ts";
import { sopUserForEmail, type SopUser } from "./sop-users.ts";
import { SOP_SESSION_COOKIE } from "./auth-session.ts";
import { VIEW_AS_COOKIE, canImpersonate } from "./impersonation.ts";
import { ensureStaffLoaded } from "./staff-store.ts";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  departmentId: string | null;
  /** The signed-in account, which differs from the fields above while impersonating. */
  actualEmail: string;
  actualName: string;
  /** True when an admin is viewing the site as another account (read-only). */
  isImpersonating: boolean;
};

/** Writes are blocked while impersonating so a preview can't touch real staff records. */
export function canWrite(user: CurrentUser): boolean {
  return !user.isImpersonating;
}

function toCurrentUser(uid: string, sopUser: SopUser, actual: SopUser): CurrentUser {
  return {
    id: uid,
    name: sopUser.name,
    email: sopUser.email,
    role: sopUser.role,
    departmentId: sopUser.departmentId,
    actualEmail: actual.email,
    actualName: actual.name,
    isImpersonating: actual.email !== sopUser.email
  };
}

// Auth = Firebase Google sign-in (shared up-level-guild project). The client signs in
// with Google; /api/auth/session verifies the Google ID token and mints our own signed
// session cookie (jose HS256). Here we verify that session and map the email to a role
// via the SOP allow-list (sop-users.ts). When no SESSION_SECRET is configured (local
// dev), fall back to a preview admin so the app runs with `npm run dev` and no login.
export async function requireUser(): Promise<CurrentUser> {
  const token = (await cookies()).get("test_sop_rehearsal")?.value;
  const verified = token ? await verifyGoogleIdToken(token) : null;
  if (!verified) redirect("/login");
  return {id: verified.uid, name: "ผู้ทดสอบ " + verified.rehearsalRole, email: verified.email,
    role: verified.rehearsalRole === "sop" ? "employee" : "admin", departmentId: "front-store",
    actualEmail: verified.email, actualName: "ผู้ทดสอบ " + verified.rehearsalRole, isImpersonating: false};
}

/** The signed-in account, ignoring any impersonation — for audit fields and view-as guards. */
export async function requireActualUser(): Promise<SopUser> {
  const user = await requireUser();
  const actual = sopUserForEmail(user.actualEmail);
  if (!actual) redirect("/login?denied=1");
  return actual;
}
