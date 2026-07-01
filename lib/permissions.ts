export type Role = "employee" | "leader" | "admin";
export type SopStatus = "draft" | "pending_approval" | "published" | "needs_revision";

export type Actor = {
  role: Role;
  departmentId: string | null;
};

export type SopPermissionTarget = {
  status: SopStatus;
  departmentId: string;
};

export function canReadSop(actor: Actor, sop: SopPermissionTarget): boolean {
  if (actor.role === "admin") return true;
  if (actor.role === "leader" && actor.departmentId === sop.departmentId) return true;
  return sop.status === "published";
}

export function canEditSop(actor: Actor, sop: SopPermissionTarget): boolean {
  if (actor.role === "admin") return true;
  if (actor.role !== "leader") return false;
  if (actor.departmentId !== sop.departmentId) return false;
  return sop.status === "draft" || sop.status === "needs_revision";
}

export function canSubmitForApproval(actor: Actor, sop: SopPermissionTarget): boolean {
  if (actor.role !== "leader") return false;
  if (actor.departmentId !== sop.departmentId) return false;
  return sop.status === "draft" || sop.status === "needs_revision";
}

export function canApproveSop(actor: Actor): boolean {
  return actor.role === "admin";
}
