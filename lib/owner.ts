// Owner tier — a level ABOVE admin. Only owners see money-sensitive data
// (salary deductions, sales/stock value). Regular admins (e.g. managers) see
// everything else but NOT owner-only figures.

export const OWNER_EMAILS = ["champ.championest@gmail.com", "namenrw@gmail.com", "kittibhonlim@gmail.com"];

export function isOwner(email?: string | null): boolean {
  return !!email && OWNER_EMAILS.includes(email.trim().toLowerCase());
}

// ใครแก้ "ใครเข้าระบบได้บ้าง" ได้ — แคบกว่า owner อีกชั้น.
// การเพิ่ม/ลบอีเมลคือการเปิดหรือปิดประตูเข้าระบบทั้งใบ ปล่อยให้แก้ได้หลายคนไม่คุ้ม
// กับความเสี่ยง Champ จึงขอให้เหลือบัญชีเดียว (10 ส.ค. 2026).
export const STAFF_ADMIN_EMAILS = ["champ.championest@gmail.com"];

export function canManageStaffAccounts(email?: string | null): boolean {
  return !!email && STAFF_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
