// เสียงจากสมาชิกถึงพนักงาน (ชม / แนะนำ / ติ) — ฝั่งอ่านของเว็บ SOP
//
// สมาชิกส่งจากเว็บกิลด์ (guild.uplevelguild.com/staff-feedback) ลง Firestore คอลเลกชัน
// `staff_feedback` ของ Firebase project เดียวกัน. ไฟล์นี้คือฝั่งที่พนักงานและหัวหน้าอ่าน:
//
//   - คำชม   → พนักงานเห็นทันทีที่สมาชิกกดส่ง (จุดประสงค์คือให้กำลังใจถึงตัวเร็วที่สุด)
//   - ติ/แนะนำ → หัวหน้าอ่านก่อน แล้วกด "ให้พนักงานเห็น" ถึงจะขึ้นหน้าพนักงาน
//   - ชื่อผู้ส่ง เห็นเฉพาะหัวหน้า ไม่ส่งต่อให้พนักงานไม่ว่ากรณีใด
//
// **ไม่ผูกกับคะแนน KPI** — เป็นเสียงสะท้อนล้วนๆ การหัก/คืนคะแนนยังทำทางเดิมทางเดียว
// (score adjustment) เพื่อไม่ให้เกิดสองช่องทางที่กระทบเงินเดือน.
//
// pure logic ล้วน — ตัวอ่าน/เขียนจริงอยู่ที่ /api/staff-feedback (Admin SDK).

export const STAFF_FEEDBACK_COLLECTION = "staff_feedback";

export type StaffFeedbackKind = "praise" | "suggestion" | "complaint";

export const FEEDBACK_KIND_LABEL: Record<StaffFeedbackKind, string> = {
  praise: "คำชม",
  suggestion: "คำแนะนำ",
  complaint: "คำติ"
};

export const FEEDBACK_KIND_CLASS: Record<StaffFeedbackKind, string> = {
  praise: "is-praise",
  suggestion: "is-suggestion",
  complaint: "is-complaint"
};

export type StaffFeedback = {
  id: string;
  staffCode: string;
  staffName: string;
  kind: StaffFeedbackKind;
  message: string;
  /** ผู้ส่ง — ฝั่งพนักงานต้องไม่เห็นสองฟิลด์นี้ */
  memberUid: string;
  memberName: string;
  createdAt: string;
  visibleToStaff: boolean;
  reviewedBy?: string;
  reviewedAt?: string;
  hidden?: boolean;
};

/** ตัดข้อมูลผู้ส่งออกก่อนส่งให้ฝั่งพนักงาน — เสียงถึงพนักงานต้องไม่ระบุตัวคนส่งเสมอ */
export type StaffFeedbackForStaff = Omit<StaffFeedback, "memberUid" | "memberName" | "reviewedBy">;

export function stripSender(feedback: StaffFeedback): StaffFeedbackForStaff {
  const { memberUid: _uid, memberName: _name, reviewedBy: _by, ...rest } = feedback;
  void _uid;
  void _name;
  void _by;
  return rest;
}

/** เสียงที่พนักงานคนนี้ควรเห็น: ของตัวเอง ถูกเปิดให้เห็นแล้ว และไม่ถูกซ่อน */
export function visibleForStaff(items: StaffFeedback[], staffCode: string): StaffFeedbackForStaff[] {
  return items
    .filter((item) => item.staffCode === staffCode && item.visibleToStaff && !item.hidden)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(stripSender);
}

/** เสียงทั้งหมดของพนักงานคนนี้สำหรับหัวหน้า (รวมที่ยังไม่เปิดให้พนักงานเห็น) */
export function allForAdmin(items: StaffFeedback[], staffCode: string): StaffFeedback[] {
  return items.filter((item) => item.staffCode === staffCode).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** ยังไม่ได้ตรวจกี่อัน — คำติ/คำแนะนำที่ยังไม่ถูกเปิดหรือซ่อน */
export function pendingReviewCount(items: StaffFeedback[]): number {
  return items.filter((item) => !item.visibleToStaff && !item.hidden).length;
}

export type FeedbackTally = { praise: number; suggestion: number; complaint: number };

/** นับแยกชนิด — ใช้ขึ้นสรุปสั้นๆ บนหัวบล็อก */
export function tally(items: Array<{ kind: StaffFeedbackKind }>): FeedbackTally {
  return {
    praise: items.filter((item) => item.kind === "praise").length,
    suggestion: items.filter((item) => item.kind === "suggestion").length,
    complaint: items.filter((item) => item.kind === "complaint").length
  };
}

export function feedbackDateLabel(createdAtIso: string): string {
  const parsed = Date.parse(createdAtIso);
  if (Number.isNaN(parsed)) return createdAtIso.slice(0, 10);
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(parsed));
}
