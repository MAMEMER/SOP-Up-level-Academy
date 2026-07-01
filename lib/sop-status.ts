import type { Role, SopStatus } from "./permissions.ts";

export function canTransitionSopStatus(role: Role, from: SopStatus, to: SopStatus): boolean {
  if (role === "admin") {
    if (from === "pending_approval" && (to === "published" || to === "needs_revision")) return true;
    if (from === "published" && to === "draft") return true;
    return from === to;
  }

  if (role === "leader") {
    if ((from === "draft" || from === "needs_revision") && to === "pending_approval") return true;
    return from === to;
  }

  return false;
}
