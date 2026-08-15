// Owner tier — a level ABOVE admin. Only owners see money-sensitive data
// (salary deductions, sales/stock value). Regular admins (e.g. managers) see
// everything else but NOT owner-only figures.

export const OWNER_EMAILS = ["champ.championest@gmail.com", "namenrw@gmail.com", "kittibhonlim@gmail.com"];

export function isOwner(email?: string | null): boolean {
  return !!email && OWNER_EMAILS.includes(email.trim().toLowerCase());
}

// ใครแก้ "ใครเข้าระบบได้บ้าง" ได้ — แคบกว่า owner อีกชั้น.
// การเพิ่ม/ลบอีเมลคือการเปิดหรือปิดประตูเข้าระบบทั้งใบ จึงไม่เปิดให้พนักงานหรือ
// ระดับ admin ทั่วไปแตะ. เดิมเหลือบัญชีแชมป์คนเดียว (10 ส.ค. 2026) — เปิดให้เคน
// (หุ้นส่วน) ด้วยตามที่ Champ สั่ง 15 ส.ค. 2026. เนมยังไม่อยู่ในชั้นนี้.
export const STAFF_ADMIN_EMAILS = ["champ.championest@gmail.com", "kittibhonlim@gmail.com"];

export function canManageStaffAccounts(email?: string | null): boolean {
  return !!email && STAFF_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
