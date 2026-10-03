import { cookies } from "next/headers";
import { allBranchKeys } from "./store-config.ts";

// หน้าแอดมินเลือกดูสาขาได้: "all" = สองสาขาคู่กัน, หรือทีละสาขา. ตัวเลือกล่าสุดจำไว้ในคุกกี้
// เพื่อให้กดไปหน้าอื่นแล้วยังอยู่สาขาเดิม — ลิงก์ที่มี ?branch= ชนะคุกกี้เสมอ.
// สองคุกกี้แยกกัน: หน้าที่ดูได้สองสาขา (hub, ops) กับหน้าที่ทำงานทีละสาขา — เลือกสาขาในหน้าสั่งงาน
// ต้องไม่ทำให้ hub เลิกเปิดแบบสองสาขาคู่กัน
export const ADMIN_VIEW_COOKIE = "sop_admin_view";
export const ADMIN_BRANCH_COOKIE = "sop_admin_branch";
export const ADMIN_BRANCH_ALL = "all";

export function isBranchKey(value: string | null | undefined): value is string {
  return !!value && allBranchKeys().includes(value);
}

/** หน้าแบบดูได้หลายสาขา: คืน "all" หรือ key สาขา (ค่าเริ่มต้น = all) */
export async function resolveAdminBranchView(param: string | string[] | undefined): Promise<string> {
  const raw = Array.isArray(param) ? param[0] : param;
  if (raw === ADMIN_BRANCH_ALL || isBranchKey(raw)) return raw;
  const saved = (await cookies()).get(ADMIN_VIEW_COOKIE)?.value;
  if (saved === ADMIN_BRANCH_ALL || isBranchKey(saved)) return saved;
  return ADMIN_BRANCH_ALL;
}

/** หน้าที่แก้ข้อมูลได้ทีละสาขา (ฟอร์มสั่งงาน, ตั้งค่า checklist ฯลฯ): คืน key สาขาเสมอ */
export async function resolveAdminBranch(param: string | string[] | undefined): Promise<string> {
  const raw = Array.isArray(param) ? param[0] : param;
  if (isBranchKey(raw)) return raw;
  const saved = (await cookies()).get(ADMIN_BRANCH_COOKIE)?.value;
  return isBranchKey(saved) ? saved : allBranchKeys()[0];
}

/** สาขาที่ต้องแสดงสำหรับมุมมองนี้ ("all" → ทุกสาขาเรียงตามลำดับ) */
export function branchesForView(view: string): string[] {
  return isBranchKey(view) ? [view] : allBranchKeys();
}
