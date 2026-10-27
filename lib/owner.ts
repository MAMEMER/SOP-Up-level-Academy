// Owner tier — a level ABOVE admin. Only owners see money-sensitive data
// (salary deductions, sales/stock value). Regular admins (e.g. managers) see
// everything else but NOT owner-only figures.

// ท้อป (kananut.top) เพิ่ม 27 ต.ค. 2026 — Champ สั่ง "ท้อปเข้าดูได้ทั้งหมด" (ทำ Masterplan/การเงิน).
// ดูได้ทุกอย่างรวมเงินเดือน แต่ไม่ได้อยู่ใน STAFF_ADMIN_EMAILS (แก้บัญชีผู้ใช้ไม่ได้).
export const OWNER_EMAILS = ["champ.championest@gmail.com", "namenrw@gmail.com", "kittibhonlim@gmail.com", "sin.sirisa@gmail.com", "kananut.top@gmail.com"];

export function isOwner(email?: string | null): boolean {
  return !!email && OWNER_EMAILS.includes(email.trim().toLowerCase());
}

// ใครแก้ "ใครเข้าระบบได้บ้าง" ได้ — แคบกว่า owner อีกชั้น.
// การเพิ่ม/ลบอีเมลคือการเปิดหรือปิดประตูเข้าระบบทั้งใบ จึงไม่เปิดให้พนักงานหรือ
// ระดับ admin ทั่วไปแตะ. เดิมเหลือบัญชีแชมป์คนเดียว (10 ส.ค. 2026) — เปิดให้เคน
// (หุ้นส่วน) ด้วยตามที่ Champ สั่ง 15 ส.ค. 2026. เพิ่มเนมกับมุก (ดูแล HR) ตามที่
// Champ สั่ง 10 ต.ค. 2026.
export const STAFF_ADMIN_EMAILS = [
  "champ.championest@gmail.com",
  "kittibhonlim@gmail.com",
  "namenrw@gmail.com",
  "sin.sirisa@gmail.com",
];

export function canManageStaffAccounts(email?: string | null): boolean {
  return !!email && STAFF_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
