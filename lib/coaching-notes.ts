// คำแนะนำจากหัวหน้าถึงพนักงานรายคน — เจ้าของเขียนจากหน้าประเมินผลงาน (/my-review) แล้วพนักงาน
// เห็นในหน้าเดียวกันของตัวเอง พร้อมรูปประกอบ (เช่น รูปชั้นวางที่จัดผิด, สลิปที่กรอกไม่ครบ).
//
// ตั้งใจให้เป็น "คำแนะนำ" ไม่ใช่ช่องให้คะแนน — ไม่แตะ KPI เลย. การหัก/คืนคะแนนยังทำที่
// score adjustment เหมือนเดิม เพื่อไม่ให้เกิดสองทางที่กระทบเงินเดือน.
//
// pure logic ล้วน — เอกสารจริงอยู่ใน Firestore `sop_coaching_notes` เขียนผ่าน
// /api/coaching-notes เท่านั้น (Admin SDK, ตัวตนจาก session).

export const COACHING_NOTES_COLLECTION = "sop_coaching_notes";

/** แนบรูปได้สูงสุดกี่รูปต่อคำแนะนำ — เท่ากับ EvidencePhotosInput ที่ใช้ในฟอร์ม */
export const MAX_NOTE_IMAGES = 3;
/** ความยาวข้อความสูงสุด (กันเอกสารบวมและกันวางทั้งบทความ) */
export const MAX_NOTE_LENGTH = 2000;

export type CoachingNote = {
  id: string;
  branch: string;
  /** staff code ของคนที่ได้รับคำแนะนำ */
  staffCode: string;
  /** งวดคะแนนที่คำแนะนำนี้อ้างถึง (เช่น "2026-08") — ไว้โยงกับรอบประเมิน */
  period: string;
  note: string;
  /** ลิงก์รูปใน Firebase Storage (อัปโหลดผ่าน /api/evidence-upload) */
  images?: string[];
  /** อีเมลผู้เขียน — มาจาก session เสมอ */
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  /** พนักงานกดรับทราบเมื่อไหร่ (ยังไม่กด = ไม่มีค่า) */
  acknowledgedAt?: string;
};

/** ข้อความ error ภาษาไทย หรือ null เมื่อผ่าน — ใช้ทั้ง client (กันกดพลาด) และ server (ตัวจริง) */
export function validateNoteDraft(input: { staffCode?: string; note?: string; images?: string[] }): string | null {
  if (!input.staffCode || !input.staffCode.trim()) return "ต้องเลือกพนักงานที่จะส่งคำแนะนำให้";
  const note = (input.note || "").trim();
  if (!note) return "เขียนคำแนะนำก่อนส่ง";
  if (note.length > MAX_NOTE_LENGTH) return `คำแนะนำยาวเกินไป (สูงสุด ${MAX_NOTE_LENGTH} ตัวอักษร)`;
  if ((input.images || []).length > MAX_NOTE_IMAGES) return `แนบรูปได้สูงสุด ${MAX_NOTE_IMAGES} รูป`;
  return null;
}

/** คำแนะนำของคนนี้ ใหม่สุดขึ้นก่อน */
export function notesForStaff(notes: CoachingNote[], staffCode: string): CoachingNote[] {
  return notes
    .filter((note) => note.staffCode === staffCode)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** ยังไม่ได้กดรับทราบกี่อัน — ใช้ขึ้นป้ายเตือนบนหัวข้อ */
export function unacknowledgedCount(notes: CoachingNote[]): number {
  return notes.filter((note) => !note.acknowledgedAt).length;
}

/** วันที่แบบสั้นสำหรับแสดงบนการ์ด (เวลาไทย) */
export function noteDateLabel(createdAtIso: string): string {
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
