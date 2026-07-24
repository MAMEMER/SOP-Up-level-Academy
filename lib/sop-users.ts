import type { Role } from "./permissions.ts";

// SOP access allow-list. A small, trusted team, so membership + role live here as
// code (mirrors the guild admin list + the SOP employee directory). Anyone signing
// in with a Google account NOT on this list is denied. Keep emails lowercase.
//   admin    = owner tier (Champ + เนม) — full planning + review
//   employee = front-store staff — personal shift view + checklist + handoff

export type SopUser = {
  email: string;
  name: string;
  role: Role;
  departmentId: string | null;
};

export const sopUsers: SopUser[] = [
  { email: "champ.championest@gmail.com", name: "Champ Master", role: "admin", departmentId: "admin" },
  { email: "namenrw@gmail.com", name: "Namen RW", role: "admin", departmentId: "admin" },
  { email: "boomboom08755@gmail.com", name: "บูม", role: "employee", departmentId: "front-store" },
  { email: "phooreephat.k@gmail.com", name: "ไอซ์", role: "employee", departmentId: "front-store" },
  { email: "nuslove2560@gmail.com", name: "ลีโอ", role: "employee", departmentId: "front-store" }
];

export function sopUserForEmail(email: string | null | undefined): SopUser | undefined {
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized) return undefined;
  return sopUsers.find((user) => user.email === normalized);
}
