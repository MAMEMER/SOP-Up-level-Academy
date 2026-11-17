// บันทึกความผิดตาม SOP (ระบบ KPI ใหม่ หมวด ค1) — วัดงานพื้นฐานกลุ่ม 1.1 และ 2.1.
//
// กติกาจากเอกสาร "ระบบ KPI และแผนพัฒนา" (12 พ.ย. 2569):
//  - แต่ละกลุ่มเริ่ม 100 ทุกเดือน หักตามความผิดที่บันทึก ต่ำสุด 0 · ทุกบันทึกต้องมีรหัสงาน
//  - ไม่ตั้งใจ: นับแยกรหัสงาน อายุ 3 เดือน · ครั้งที่ 1..6+ หัก 0/3/6/12/24/30 (ครั้งแรกบันทึกและสอน)
//  - ละเลย: ไม่มีครั้งแรกฟรี · นับแยกรหัสงาน อายุ 3 เดือน · หัก 10/20/30
//  - จงใจ: กลุ่มนั้นเหลือ 0 + เข้ากระบวนการวินัยแยกจาก KPI
//  - ไม่คิดตามมูลค่าความเสียหาย
//  - พนักงานเห็นบันทึกของตัวเอง โต้แย้งได้ภายใน 3 วัน · คนตัดสินต้องไม่ใช่คนบันทึก
//
// แยกจาก performance-score เดิมทั้งหมด (ไม่หักคะแนน/เงินเดือนของระบบเก่า).
// pure logic ล้วน; เก็บจริงที่ Firestore `sop_mistake_log` ผ่าน mistake-log-store.ts.

export const MISTAKE_LOG_COLLECTION = "sop_mistake_log";

export type MistakeGroup = "1.1" | "2.1" | "3";

export type SopTaskCode = { code: string; name: string; group: MistakeGroup };

export const sopTaskCodes: SopTaskCode[] = [
  { code: "1.1.1", name: "ขายของ คิดเงิน", group: "1.1" },
  { code: "1.1.2", name: "ทำความสะอาด", group: "1.1" },
  { code: "1.1.3", name: "เปิดร้าน จัดโต๊ะ ปิดร้าน เก็บโต๊ะ", group: "1.1" },
  { code: "1.1.4", name: "จัดเรียงสินค้าบนชั้นวาง", group: "1.1" },
  { code: "1.1.5", name: "ติดป้ายราคา", group: "1.1" },
  { code: "1.1.6", name: "จัดการ online order และส่งมอบสินค้า", group: "1.1" },
  { code: "1.1.7", name: "ต้อนรับ ทักทาย ตอบคำถามพื้นฐาน", group: "1.1" },
  { code: "1.1.8", name: "ตรวจยอดเงินเข้าบัญชีร้านก่อนส่งมอบ", group: "1.1" },
  { code: "1.1.9", name: "แพ็คและป้องกันการ์ดซิงเกิลตอนส่งมอบ", group: "1.1" },
  { code: "1.1.10", name: "ดูแลตู้การ์ดซิงเกิล เปิด ปิด ล็อก", group: "1.1" },
  { code: "1.1.11", name: "เก็บบอร์ดเกมหลังลูกค้าเล่น เช็กชิ้นส่วน", group: "1.1" },
  { code: "1.1.12", name: "รับคืนหรือเปลี่ยนสินค้าตามนโยบายร้าน", group: "1.1" },
  { code: "1.1.13", name: "ถ่ายรูปหน้าร้านและบรรยากาศ", group: "1.1" },
  { code: "2.1.1", name: "นับ stock ปิดยอดสาขา รายงาน", group: "2.1" },
  { code: "2.1.2", name: "stock count รอบเดือน", group: "2.1" },
  { code: "2.1.3", name: "ลงทะเบียนสินทรัพย์ ระบุตำแหน่ง", group: "2.1" },
  { code: "2.1.4", name: "รับสินค้าเข้าคลังสาขา", group: "2.1" },
  { code: "2.1.5", name: "เบิกยืมและรับคืนสินค้าจากคลัง", group: "2.1" },
  { code: "2.1.7", name: "จัดเก็บคลังให้ตรงตำแหน่ง", group: "2.1" },
  { code: "2.1.8", name: "บันทึกสินค้าชำรุด สูญหาย หรือหมดอายุ", group: "2.1" },
  { code: "2.1.9", name: "โอนย้ายสินค้าระหว่างสาขา", group: "2.1" },
  { code: "2.1.10", name: "แพ็คส่งสินค้าออนไลน์และบันทึกเลขพัสดุ", group: "2.1" },
  { code: "2.1.11", name: "ลงข้อมูลการ์ดซิงเกิลเข้าระบบ", group: "2.1" },
  { code: "2.1.12", name: "เช็กวัสดุสิ้นเปลืองและแจ้งเติม", group: "2.1" },
  { code: "2.1.13", name: "กรอก checklist ในระบบ SOP", group: "2.1" },
  // 3.12 เพื่อนมองไม่เห็น จึงไม่อยู่ใน 360 — ถ้าพบว่าทำผิดให้บันทึกแบบ ค1
  { code: "3.12", name: "รักษาความลับร้าน", group: "3" }
];

export function taskByCode(code: string): SopTaskCode | undefined {
  return sopTaskCodes.find((task) => task.code === code);
}

export type MistakeLevel = "unintentional" | "negligent" | "intentional";

export const mistakeLevels: { value: MistakeLevel; label: string; hint: string }[] = [
  { value: "unintentional", label: "ไม่ตั้งใจ", hint: "ทำไม่ถึงมาตรฐาน หรือไม่รู้ · ครั้งแรกไม่หัก แต่บันทึกและสอนทันที" },
  { value: "negligent", label: "ละเลย", hint: "รู้ขั้นตอนแต่ไม่ทำ · ไม่มีครั้งแรกฟรี" },
  { value: "intentional", label: "จงใจ", hint: "กลุ่มนั้นเหลือ 0 และเข้ากระบวนการวินัยแยกจาก KPI" }
];

export function levelLabel(level: MistakeLevel): string {
  return mistakeLevels.find((entry) => entry.value === level)?.label || level;
}

const UNINTENTIONAL_STEPS = [0, 3, 6, 12, 24, 30];
const NEGLIGENT_STEPS = [10, 20, 30];

export type AppealDecision = "upheld" | "voided";

export type MistakeRecord = {
  id: string;
  staffCode: string;
  branch: string;
  /** วันที่เกิดเหตุ YYYY-MM-DD */
  date: string;
  taskCode: string;
  level: MistakeLevel;
  note: string;
  recordedBy: string;
  recordedByName?: string;
  createdAt: string;
  appeal?: { text: string; at: string };
  decision?: { result: AppealDecision; by: string; byName?: string; at: string; note?: string };
};

export const APPEAL_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export function appealDeadline(record: MistakeRecord): string {
  return new Date(Date.parse(record.createdAt) + APPEAL_WINDOW_MS).toISOString();
}

export function canAppeal(record: MistakeRecord, nowIso: string): boolean {
  return !record.appeal && !record.decision && Date.parse(nowIso) <= Date.parse(appealDeadline(record));
}

export function isVoided(record: MistakeRecord): boolean {
  return record.decision?.result === "voided";
}

/** ตัดสินโต้แย้งได้ไหม: ต้องมีคำโต้แย้งค้าง และคนตัดสินไม่ใช่คนบันทึก */
export function canDecide(record: MistakeRecord, deciderEmail: string): boolean {
  return Boolean(record.appeal && !record.decision && record.recordedBy.toLowerCase() !== deciderEmail.toLowerCase());
}

export function isDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

/** ย้อน 3 เดือนตามปฏิทิน (31 พ.ค. → 28/29 ก.พ.) */
export function threeMonthsBefore(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  let month = m - 3;
  let year = y;
  if (month < 1) {
    month += 12;
    year -= 1;
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

const byTime = (a: MistakeRecord, b: MistakeRecord) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);

/** ครั้งที่เท่าไรของงานเดิม ระดับเดิม ในช่วง 3 เดือนที่ผ่านมา (นับรวมครั้งนี้) */
export function occurrenceOf(record: MistakeRecord, all: MistakeRecord[]): number {
  const from = threeMonthsBefore(record.date);
  const same = all
    .filter(
      (other) =>
        !isVoided(other) &&
        other.staffCode === record.staffCode &&
        other.taskCode === record.taskCode &&
        other.level === record.level &&
        other.date > from &&
        byTime(other, record) <= 0
    )
    .sort(byTime);
  return Math.max(1, same.findIndex((other) => other.id === record.id) + 1 || same.length);
}

/** คะแนนที่หักจากบันทึกนี้ (จงใจ = null เพราะทั้งกลุ่มเหลือ 0) */
export function deductionFor(record: MistakeRecord, all: MistakeRecord[]): number | null {
  if (isVoided(record)) return 0;
  if (record.level === "intentional") return null;
  const nth = occurrenceOf(record, all);
  const steps = record.level === "negligent" ? NEGLIGENT_STEPS : UNINTENTIONAL_STEPS;
  return steps[Math.min(nth, steps.length) - 1];
}

export type GroupScore = { group: MistakeGroup; score: number; deducted: number; records: number; intentional: boolean };

/** คะแนนกลุ่ม 1.1 / 2.1 ของเดือนหนึ่ง (100 − ที่หัก ต่ำสุด 0 · มีจงใจ = 0) */
export function monthlyGroupScores(all: MistakeRecord[], staffCode: string, period: string): GroupScore[] {
  return (["1.1", "2.1"] as MistakeGroup[]).map((group) => {
    const inMonth = all.filter(
      (record) =>
        record.staffCode === staffCode &&
        record.date.startsWith(period) &&
        !isVoided(record) &&
        taskByCode(record.taskCode)?.group === group
    );
    const intentional = inMonth.some((record) => record.level === "intentional");
    const deducted = inMonth.reduce((sum, record) => sum + (deductionFor(record, all) ?? 0), 0);
    return {
      group,
      score: intentional ? 0 : Math.max(0, 100 - deducted),
      deducted,
      records: inMonth.length,
      intentional
    };
  });
}

export function validateMistakeDraft(input: {
  staffCode?: string;
  date?: string;
  taskCode?: string;
  level?: string;
  note?: string;
}): string | null {
  if (!input.staffCode) return "เลือกพนักงาน";
  if (!isDate(input.date)) return "ใส่วันที่เกิดเหตุ";
  if (!input.taskCode || !taskByCode(input.taskCode)) return "เลือกรหัสงาน";
  if (!mistakeLevels.some((entry) => entry.value === input.level)) return "เลือกระดับความผิด";
  if (!(input.note || "").trim()) return "เขียนว่าเกิดอะไรขึ้น";
  return null;
}
