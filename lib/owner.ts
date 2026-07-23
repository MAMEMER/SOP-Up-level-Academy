// Owner tier — a level ABOVE admin. Only owners see money-sensitive data
// (salary deductions, sales/stock value). Regular admins (e.g. managers) see
// everything else but NOT owner-only figures.

export const OWNER_EMAILS = ["champ.championest@gmail.com", "namenrw@gmail.com"];

export function isOwner(email?: string | null): boolean {
  return !!email && OWNER_EMAILS.includes(email.trim().toLowerCase());
}
