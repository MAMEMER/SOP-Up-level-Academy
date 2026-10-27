// Who may use the Masterplan workspace (/masterplan). A fixed, code-based list — same
// stance as OWNER_EMAILS: access is decided by git, not by a database row anyone could edit.
//
// This list is SEPARATE from the SOP allow-list (sop-users.ts). Being here grants the
// Masterplan pages only: requireUser() still checks sopUserForEmail(), so an account that
// is only here is denied on every SOP page. (ท้อป was masterplan-only until 2026-10-27; Champ then gave him full SOP view — see owner.ts.)
//
// editor = may apply accepted proposals to ฉบับกลาง and edit it directly (with a reason
// that goes to the changelog), and may import documents.

export type MasterplanMemberKey = "champ" | "top" | "name" | "muk";

export type MasterplanMember = {
  key: MasterplanMemberKey;
  name: string;
  email: string;
  editor: boolean;
};

export const MASTERPLAN_MEMBERS: readonly MasterplanMember[] = [
  { key: "champ", name: "แชมป์", email: "champ.championest@gmail.com", editor: true },
  { key: "top", name: "ท้อป", email: "kananut.top@gmail.com", editor: true },
  { key: "name", name: "เนม", email: "namenrw@gmail.com", editor: true },
  { key: "muk", name: "มุก", email: "sin.sirisa@gmail.com", editor: false }
];

export function memberForEmail(email: string | null | undefined): MasterplanMember | undefined {
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized) return undefined;
  return MASTERPLAN_MEMBERS.find((member) => member.email === normalized);
}

export function memberByKey(key: string | null | undefined): MasterplanMember | undefined {
  return MASTERPLAN_MEMBERS.find((member) => member.key === key);
}

export function memberName(key: string | null | undefined): string {
  return memberByKey(key)?.name ?? "-";
}

/**
 * The ?next= target after sign-in. Only same-site paths are honoured: it must start with
 * "/" and must not start with "//" or "/\" (both are protocol-relative to browsers, i.e. an
 * open redirect to another host). Anything else returns null.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (typeof next !== "string") return null;
  const value = next.trim();
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  // control characters (tab/newline) are stripped by URL parsers and can turn "/\t/evil" into "//evil"
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  if (value.length > 512) return null;
  return value;
}
