// ตัวชี้วัด skill พนักงาน 15 ตัว (Hard 7 + Soft 8) ตามภาพ "เส้นทางเลื่อนขั้น 4 ขั้น" และ
// "คู่มือประเมิน skill" (เนม 4 พ.ย. 2569 · ประเมินทุก 2 สัปดาห์). เป็นข้อมูลล้วน ไม่มี I/O.
//
// ระบบ skill แยกจาก KPI/เงินเดือนทั้งหมด — ไม่มีอะไรในไฟล์นี้ถูกส่งเข้า performance-score.

export type SkillGroup = "hard" | "soft";

/** ขั้นตำแหน่งตามภาพ Career Path */
export type CareerStage = "parttime" | "regular" | "shift_lead" | "manager";

export const careerStages: Array<{ id: CareerStage; label: string }> = [
  { id: "parttime", label: "พาร์ทไทม์" },
  { id: "regular", label: "ประจำ" },
  { id: "shift_lead", label: "หัวหน้ากะ" },
  { id: "manager", label: "ผู้จัดการ" }
];

export type SkillIndicator = {
  id: string;
  group: SkillGroup;
  name: string;
  /** เสี่ยงสูง = นับรอบติดกัน + ต้องผู้ประเมิน 2 คนยืนยัน */
  highRisk: boolean;
  /** ระดับขั้นต่ำของแต่ละขั้นตำแหน่ง (0 = ยังไม่ต้องมี) */
  required: Record<CareerStage, number>;
  /** เกณฑ์ "ผ่านรอบนี้" ของระดับ 2 และ 3 (ข้อความจากคู่มือ) */
  criteria: { l2: string; l3: string };
  /** หลักฐานที่ใช้ดู */
  evidence: string;
};

const req = (parttime: number, regular: number, shift_lead: number, manager: number) => ({
  parttime,
  regular,
  shift_lead,
  manager
});

export const skillIndicators: SkillIndicator[] = [
  {
    id: "cashier",
    group: "hard",
    name: "การคิดเงินและขายสินค้า",
    highRisk: true,
    required: req(2, 2, 3, 3),
    criteria: {
      l2: "ออกบิลติดหมวดสินค้าและรหัสผู้เล่นถูกทุกบิล · ปิดลิ้นชักโดยมีคนดู ส่วนต่าง 0 บาท (รวม ≥ 8 ครั้งก่อนถือลิ้นชักคนเดียว)",
      l3: "ปิดลิ้นชักเองทุกกะ ไม่มีส่วนต่างที่อธิบายไม่ได้ · แนะนำสินค้า/ราคา/โปรได้เอง · สอนน้องใหม่จนผ่านระดับ 2 อย่างน้อย 1 คน"
    },
    evidence: "ปิดยอดประจำวัน · StoreHub · ดอกไม้"
  },
  {
    id: "weekly_event",
    group: "hard",
    name: "Weekly Event",
    highRisk: false,
    required: req(1, 2, 2, 3),
    criteria: {
      l2: "คุมอีเวนต์ประจำสัปดาห์เองได้ เช็กอินครบ คุมเวลาแต่ละรอบ · ส่งรายงานผู้ผลิตภายในวันจัด",
      l3: "ตัดสินกติกาในอีเวนต์จริงได้เอง (แยกต่อเกม) · สอนคลาสมือใหม่ · นำ Pre-release ≥ 1 ครั้ง"
    },
    evidence: "เช็คลิสต์วันกิจกรรม"
  },
  {
    id: "stock",
    group: "hard",
    name: "Stock สินค้า",
    highRisk: false,
    required: req(1, 2, 2, 3),
    criteria: {
      l2: "นับสต็อกรอบสัปดาห์ครบและตรงเวลา · รับของนับตรงใบส่งทุกล็อต · ส่วนต่างอธิบายได้ครบ",
      l3: "หาสาเหตุยอดไม่ตรงและแก้ในระบบถูก · แจ้งของใกล้หมดก่อนขาด · หมวด Stock ≥ 18"
    },
    evidence: "รอบนับสต็อก · ของหาย · หมวด Stock"
  },
  {
    id: "checklist",
    group: "hard",
    name: "ทำงานตาม Checklist",
    highRisk: false,
    required: req(2, 2, 3, 3),
    criteria: {
      l2: "ส่งเช็คลิสต์ครบทุกวันที่เข้ากะ · ไม่มีบันทึกเท็จ สุ่มตรวจตรงของจริง",
      l3: "ตรวจเช็คลิสต์ของคนในกะและตามให้ครบก่อนปิดกะ · เสนอแก้รายการที่ไม่ตรงงานจริง ≥ 1 เรื่อง"
    },
    evidence: "เช็คลิสต์รายวัน · สุ่มตรวจ"
  },
  {
    id: "cleanliness",
    group: "hard",
    name: "ความสะอาดของร้าน",
    highRisk: false,
    required: req(2, 2, 3, 3),
    criteria: {
      l2: "ทำความสะอาดโซนที่ได้รับครบ · สุ่มตรวจ ≥ 1 ครั้งต่อสัปดาห์ผ่าน (รูปก่อน/หลัง)",
      l3: "ดูแลทั้งร้านในกะ แบ่งโซนและตรวจงานคนอื่น · สุ่มตรวจผ่านทุกครั้ง"
    },
    evidence: "รูปในเช็คลิสต์ · สุ่มตรวจ"
  },
  {
    id: "assigned_work",
    group: "hard",
    name: "งานที่ได้รับมอบหมาย",
    highRisk: false,
    required: req(1, 2, 2, 3),
    criteria: {
      l2: "งานที่ครบกำหนดในรอบส่งตรงเวลาทุกชิ้น · ต้องแก้ไม่เกิน 1 ชิ้น",
      l3: "เป็นเจ้าของงานกลุ่ม แบ่งงานและตามจนจบ · ไม่มีงานต้องแก้"
    },
    evidence: "งานของฉัน · ตรวจงาน"
  },
  {
    id: "shift_lead",
    group: "hard",
    name: "นำกะ",
    highRisk: false,
    required: req(0, 1, 2, 3),
    criteria: {
      l2: "นำกะเองได้ ≥ 4 กะในรอบ (เฉลี่ย 2 กะต่อสัปดาห์): แบ่งงาน ตัดสินใจ ส่งมอบกะครบ (ระดับ 1 = นำกะโดยมีผู้ประเมินดู 4 กะ)",
      l3: "นำกะวันยุ่งได้เรียบร้อย · ประเมินคู่ผู้ประเมินเดิมผลตรงกัน · ผจก. รักษาการแทน 2 สัปดาห์"
    },
    evidence: "งานส่งต่อกะ · ตารางกะ"
  },
  {
    id: "communication",
    group: "soft",
    name: "การสื่อสาร",
    highRisk: false,
    required: req(1, 2, 2, 3),
    criteria: {
      l2: "อธิบายกติกาหรือขั้นตอนให้ลูกค้าเข้าใจ · เขียนบันทึกส่งมอบกะครบ",
      l3: "สื่อสารเรื่องยาก เช่น คำตัดสินกติกา การปฏิเสธรับซื้อ ชัดเจนและสุภาพ"
    },
    evidence: "ผู้ประเมินสังเกต · บันทึกส่งมอบกะ"
  },
  {
    id: "service",
    group: "soft",
    name: "ใจบริการ",
    highRisk: false,
    required: req(2, 2, 3, 3),
    criteria: {
      l2: "ถามความต้องการแล้วแนะนำตรง จำผู้เล่นประจำได้ · ไม่มีข้อร้องเรียน",
      l3: "รับมือลูกค้าที่ไม่พอใจจนจบเรื่อง หรือได้คำชมจากลูกค้า"
    },
    evidence: "เสียงจากสมาชิก · หมวดบริการลูกค้า · ดอกไม้"
  },
  {
    id: "honesty",
    group: "soft",
    name: "ซื่อสัตย์ (ไว้ใจ)",
    highRisk: true,
    required: req(2, 2, 2, 3),
    criteria: {
      l2: "ไม่มีส่วนต่างเงิน ไม่มีบันทึกเท็จ สุ่มตรวจผ่าน ไม่มีบันทึกเรื่องความซื่อสัตย์จากเนม/แชมป์ (ปิดลิ้นชักภายใต้การดู 8 ครั้ง ส่วนต่าง 0)",
      l3: "ถือลิ้นชักเองไม่มีส่วนต่างที่อธิบายไม่ได้ · ผ่านติดกัน 6 รอบ (12 สัปดาห์) + ผู้บริหาร 2 คนอนุมัติ"
    },
    evidence: "ปิดยอดเงินสด · สุ่มตรวจ · บันทึกของเนม/แชมป์ · ลดระดับเมื่อเงินขาดที่อธิบายไม่ได้ > 100 บาทใน 2 สัปดาห์"
  },
  {
    id: "carefulness",
    group: "soft",
    name: "รอบคอบ",
    highRisk: false,
    required: req(1, 2, 2, 3),
    criteria: {
      l2: "ตรวจซ้ำก่อนส่ง เช่น นับเงินสองรอบ เทียบเลขการ์ด · ไม่มีส่วนต่างสต็อกจากความสะเพร่า",
      l3: "เห็นจุดเสี่ยงก่อนเกิด และเสนอแก้ขั้นตอน"
    },
    evidence: "ส่วนต่างเงินและสต็อก · ผลสุ่มตรวจ"
  },
  {
    id: "responsibility",
    group: "soft",
    name: "ความรับผิดชอบ",
    highRisk: false,
    required: req(1, 2, 3, 3),
    criteria: {
      l2: "เข้างานตรงเวลาทุกกะ · รับงานแล้วทำจบ แจ้งล่วงหน้าเมื่อทำไม่ได้",
      l3: "ตามงานค้างของกะจนจบ · ยอมรับเมื่อพลาดและเสนอทางแก้"
    },
    evidence: "การเข้างาน · เช็คลิสต์ · งานที่มอบหมาย"
  },
  {
    id: "problem_solving",
    group: "soft",
    name: "แก้ปัญหาเฉพาะหน้า",
    highRisk: false,
    required: req(1, 2, 2, 3),
    criteria: {
      l2: "แก้ปัญหาที่มีขั้นตอนรองรับได้เอง ไม่ต้องโทรถาม",
      l3: "แก้ปัญหาที่ไม่มีขั้นตอน แล้วเขียนขั้นตอนใหม่ให้ทีม"
    },
    evidence: "บันทึกเหตุการณ์ · คำแนะนำจากหัวหน้า"
  },
  {
    id: "leadership",
    group: "soft",
    name: "ความเป็นผู้นำ",
    highRisk: false,
    required: req(1, 1, 2, 3),
    criteria: {
      l2: "นำกะ แบ่งงาน ตัดสินใจในกะ คนในกะทำงานครบ",
      l3: "พัฒนาคนอื่นจนผ่านระดับ ≥ 1 คนในช่วงที่นับ"
    },
    evidence: "บันทึกนำกะ · จำนวนคนที่โค้ชแล้วผ่านระดับ"
  },
  {
    id: "teamwork",
    group: "soft",
    name: "ทำงานเป็นทีม",
    highRisk: false,
    required: req(1, 2, 3, 3),
    criteria: {
      l2: "รับงานที่ไม่มีคนรับเมื่อร้านต้องการ ≥ 1 ครั้งต่อสัปดาห์",
      l3: "สอนเพื่อนโดยไม่ต้องรอให้ขอ · ช่วยกะอื่นเมื่อขาดคน"
    },
    evidence: "งานกลุ่ม · รับงานต่อ · เพื่อนประเมิน"
  }
];

export const skillIndicatorIds: string[] = skillIndicators.map((indicator) => indicator.id);

export function skillIndicatorById(id: string): SkillIndicator | undefined {
  return skillIndicators.find((indicator) => indicator.id === id);
}

/** Hard skill ขึ้นได้ถึงระดับ 4, Soft skill สูงสุดระดับ 3 */
export function maxLevelFor(indicator: SkillIndicator): number {
  return indicator.group === "hard" ? 4 : 3;
}
