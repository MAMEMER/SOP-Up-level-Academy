import "server-only";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import { isWorkingAssignment, type ShiftAssignment } from "./shift-schedule.ts";
import { workingDates } from "./task-inbox.ts";

// งานแบบ "ให้เวลา N วันทำงาน" นับเฉพาะวันที่น้องเข้ากะ — อ่านจากตารางกะ (schedule_shifts).
// นับทุกสาขา (เข้ากะสาขาไหนก็เป็นวันทำงาน) และงานหลายคนนับวันที่มีใครในทีมเข้าก็ได้.
// query ด้วย staffCode อย่างเดียว (index ที่ Firestore สร้างให้เอง) แล้วกรองวันที่ในโค้ด.

const SHIFTS = "schedule_shifts";

export async function computeWorkDayDates(codes: string[], start: string, workDays: number): Promise<string[]> {
  const worked = new Set<string>();
  let lastPlanned: string | null = null;
  if (hasAdminCredentials() && codes.length) {
    const snap = await adminDb()
      .collection(SHIFTS)
      .where("staffCode", "in", codes.slice(0, 10))
      .get();
    for (const doc of snap.docs) {
      const data = doc.data() as { workDate?: string; assignment?: ShiftAssignment };
      if (!data.workDate || data.workDate < start) continue;
      if (!lastPlanned || data.workDate > lastPlanned) lastPlanned = data.workDate;
      if (data.assignment && isWorkingAssignment(data.assignment)) worked.add(data.workDate);
    }
  }
  return workingDates(start, workDays, worked, lastPlanned);
}
