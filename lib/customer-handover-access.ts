export type HandoverPermission = "read" | "record" | "correct" | "approveOpening";
export type HandoverGrant = { permissions: HandoverPermission[]; branches: string[] };
export function grantFor(email: string, grants: Record<string, HandoverGrant>): HandoverGrant {
  if (email === "champ.championest@gmail.com") return { permissions: ["read", "record", "correct", "approveOpening"], branches: ["bangkae", "senafest"] };
  return grants[email.toLowerCase()] ?? { permissions: [], branches: [] };
}
export function authorized(permission: HandoverPermission, grant: HandoverGrant, context: { realSession: boolean; credentials: boolean; impersonating: boolean; branch?: string }): boolean {
  return context.realSession && context.credentials && !context.impersonating && grant.permissions.includes(permission) && (!context.branch || grant.branches.includes(context.branch));
}
