/**
 * ระดับสิทธิ์ของ "พนักงาน" ทั้งสามค่า — ไม่มีค่าไหนแปลว่าเจ้าของร้าน.
 *
 *   employee = เห็นเฉพาะงานของตัวเอง
 *   leader   = เห็นงานในแผนกตัวเอง
 *   admin    = เห็นงานทุกคน มอบหมาย/ตรวจงาน/ตั้งค่าระบบได้
 *
 * เจ้าของร้านเป็นอีกชั้นหนึ่งที่อยู่เหนือทั้งสามค่านี้ มีแค่แชมป์กับเนม กำหนดไว้ที่
 * lib/owner.ts (OWNER_EMAILS) และเป็นชั้นเดียวที่เห็นตัวเลขเงินเดือน/การหักเงิน.
 * คำว่า "admin" ที่นี่คือชื่อระดับสิทธิ์เท่านั้น พนักงานหน้าร้านหลายคนถือสิทธิ์นี้.
 */
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
