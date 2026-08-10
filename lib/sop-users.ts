import type { Role } from "./permissions.ts";

// SOP access allow-list. A small, trusted team, so membership + role live here as
// code (mirrors the guild admin list + the SOP employee directory). Anyone signing
// in with a Google account NOT on this list is denied. Keep emails lowercase.
//
// ทั้งสองค่าเป็น "ระดับสิทธิ์ของพนักงาน" ไม่มีค่าไหนแปลว่าเจ้าของร้าน:
//   admin    = สิทธิ์จัดการงาน (วางแผน มอบหมาย ตรวจงาน) — มีแค่แชมป์กับเนม
//   employee = พนักงานหน้าร้าน — ตารางกะของตัวเอง + checklist + งานส่งต่อ
// เจ้าของร้านมีแค่แชมป์กับเนม เป็นคนละชั้นที่อยู่เหนือทั้งสองค่านี้ กำหนดที่ lib/owner.ts
// และเป็นชั้นเดียวที่เห็นตัวเลขเงินเดือน/การหักเงิน.
// 2026-08-10: Champ สั่งถอนสิทธิ์จัดการของ นน (waranon4work) และ พี (wipop.tho)
// ทั้งคู่กลับเป็น employee — ยังเข้างานหน้าร้านได้ตามปกติ.
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
  { email: "thanakornjoeblack@gmail.com", name: "Kongh", role: "employee", departmentId: "front-store" },
  { email: "waranon4work@gmail.com", name: "Non", role: "employee", departmentId: "front-store" },
  { email: "wipop.tho@gmail.com", name: "Pee", role: "employee", departmentId: "front-store" },
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
