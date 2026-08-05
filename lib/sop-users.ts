import type { Role } from "./permissions.ts";

// SOP access allow-list. A small, trusted team, so membership + role live here as
// code (mirrors the guild admin list + the SOP employee directory). Anyone signing
// in with a Google account NOT on this list is denied. Keep emails lowercase.
//   admin    = full planning + review (Champ, เนม, ก้อง, นน, พี)
//   employee = front-store staff — personal shift view + checklist + handoff
// Money-sensitive screens (salary deductions, KPI rate editing, score corrections) are
// gated separately by lib/owner.ts, not by this role.
// Leavers are removed here AND deactivated in the `sop_staff` collection, which
// overrides this seed at runtime — editing only one of the two leaves them
// signed in. ไอซ์ (phooreephat.k) resigned 2026-08-01.

export type SopUser = {
  email: string;
  name: string;
  role: Role;
  departmentId: string | null;
};

export const sopUsers: SopUser[] = [
  { email: "champ.championest@gmail.com", name: "Champ Master", role: "admin", departmentId: "admin" },
  { email: "namenrw@gmail.com", name: "Namen RW", role: "admin", departmentId: "admin" },
  { email: "thanakornjoeblack@gmail.com", name: "Kongh", role: "admin", departmentId: "front-store" },
  { email: "waranon4work@gmail.com", name: "Non", role: "admin", departmentId: "front-store" },
  { email: "wipop.tho@gmail.com", name: "Pee", role: "admin", departmentId: "front-store" },
  { email: "boomboom08755@gmail.com", name: "บูม", role: "employee", departmentId: "front-store" },
  { email: "nuslove2560@gmail.com", name: "ลีโอ", role: "employee", departmentId: "front-store" }
];

/** the compiled-in list, kept as the seed + offline fallback for the Firestore list */
export const seedSopUsers: SopUser[] = sopUsers.map((user) => ({ ...user }));

/** Replaces the allow-list in place with the accounts managed at /admin/staff. */
export function replaceSopUsers(users: SopUser[]) {
  sopUsers.splice(0, sopUsers.length, ...users);
}

export function sopUserForEmail(email: string | null | undefined): SopUser | undefined {
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized) return undefined;
  return sopUsers.find((user) => user.email === normalized);
}
