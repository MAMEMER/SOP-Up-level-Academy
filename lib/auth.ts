import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { Role } from "./permissions.ts";
import { adminAuth, hasAdminCredentials } from "./firebase-admin.ts";
import { sopUserForEmail } from "./sop-users.ts";
import { SOP_SESSION_COOKIE } from "./auth-session.ts";
// (cookie name lives in auth-session.ts to avoid a lib↔route import cycle)

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  departmentId: string | null;
};

// Auth = Firebase Google sign-in (shared up-level-guild project). The client signs in
// with Google, exchanges the ID token for a session cookie (/api/auth/session), and
// this reads + verifies that cookie on the server. Only emails on the SOP allow-list
// (sop-users.ts) get in. When the Admin service account isn't configured (local dev),
// fall back to a preview admin so the app runs with `npm run dev` and no login.
export async function requireUser(): Promise<CurrentUser> {
  if (!hasAdminCredentials()) {
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

  let email: string | undefined;
  let uid = "";
  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    email = decoded.email;
    uid = decoded.uid;
  } catch {
    redirect("/login");
  }

  const sopUser = sopUserForEmail(email);
  if (!sopUser) redirect("/login?denied=1");

  return {
    id: uid,
    name: sopUser.name,
    email: sopUser.email,
    role: sopUser.role,
    departmentId: sopUser.departmentId
  };
}
