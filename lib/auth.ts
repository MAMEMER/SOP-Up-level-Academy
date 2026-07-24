import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { Role } from "./permissions.ts";
import { hasSessionSecret, verifySession } from "./session-jwt.ts";
import { sopUserForEmail } from "./sop-users.ts";
import { SOP_SESSION_COOKIE } from "./auth-session.ts";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  departmentId: string | null;
};

// Auth = Firebase Google sign-in (shared up-level-guild project). The client signs in
// with Google; /api/auth/session verifies the Google ID token and mints our own signed
// session cookie (jose HS256). Here we verify that session and map the email to a role
// via the SOP allow-list (sop-users.ts). When no SESSION_SECRET is configured (local
// dev), fall back to a preview admin so the app runs with `npm run dev` and no login.
export async function requireUser(): Promise<CurrentUser> {
  if (!hasSessionSecret()) {
    return {
      id: "preview-admin-champ",
      name: "Champ Master",
      email: "champ.championest@gmail.com",
      role: "admin",
      departmentId: "admin"
    };
  }

  const cookie = (await cookies()).get(SOP_SESSION_COOKIE)?.value;
  if (!cookie) redirect("/login");

  const session = await verifySession(cookie);
  if (!session) redirect("/login");

  const sopUser = sopUserForEmail(session.email);
  if (!sopUser) redirect("/login?denied=1");

  return {
    id: session.uid,
    name: sopUser.name,
    email: sopUser.email,
    role: sopUser.role,
    departmentId: sopUser.departmentId
  };
}
