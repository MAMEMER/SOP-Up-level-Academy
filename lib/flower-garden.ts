// สวนดอกไม้ของพนักงาน — ฝั่งอ่านของเว็บ SOP
//
// ลูกค้าให้ดอกไม้/ใบไม้แห้งจากหน้าร้าน (เว็บกิลด์ `/tip`) ลง Firestore `flower_grants`
// ของ Firebase project เดียวกัน. ไฟล์นี้คือฝั่งที่พนักงานกับหัวหน้าเปิดดู
//
// กติกาที่แชมป์เคาะแล้ว ห้ามเปลี่ยนเอง:
//  - **พนักงานไม่มีวันเห็นว่าใครให้** ต่อให้ลูกค้าไม่ได้กด "ไม่ระบุตัวตน" ก็ตาม —
//    ตัวตนผู้ให้เป็นของเจ้าของชั้นเดียว อยู่ที่จอ /admin/flowers ของเว็บกิลด์
//  - **ดอกไม้กับใบไม้แห้งหักล้างกัน** (19 ก.ย. 2569) จำนวนเท่ากัน คนละเครื่องหมาย
//  - **เนื้อความของใบไม้แห้งไม่อยู่ในนี้** — คำติเดินประตูเดิมของ `staff_feedback`
//    คือหัวหน้าอ่านก่อนแล้วค่อยกดให้พนักงานเห็น (ดู StaffFeedbackPanel) เอาข้อความ
//    มากองรวมที่นี่เท่ากับข้ามด่านนั้น. ที่นับในสวนคือ **จำนวน** เท่านั้น
//  - **ไม่ผูกกับคะแนน KPI** — ตัวเลขนี้เป็นน้ำหนักให้หัวหน้าดูตอนประเมิน
//    การหัก/เพิ่มคะแนนยังมีทางเดียวเหมือนเดิมคือ score adjustment

export const FLOWER_GRANTS_COLLECTION = "flower_grants";
export const FLOWER_BILLS_COLLECTION = "flower_bills";

/** 5 กลีบ = 1 ดอก (ตรงกับฝั่งกิลด์ — ห้ามแยกค่ากัน) */
export const PETALS_PER_FLOWER = 5;

/**
 * เกณฑ์เดือนหนึ่งคิดจาก **ครึ่งหนึ่ง** ของดอกไม้ที่แจกได้ทั้งเดือน
 *
 * แชมป์ตั้งไว้ครึ่งเดียวเพราะในความเป็นจริงลูกค้าไม่ได้ให้ทุกบิล — ตั้งเกณฑ์ที่ 100%
 * ก็คือตั้งเป้าที่ไม่มีวันถึง แล้วตัวเลขจะกลายเป็นแค่ตัวทำให้ทุกคนดูแย่เท่ากัน
 */
export const TARGET_SHARE_OF_POTENTIAL = 0.5;

export type GrantKind = "flower" | "leaf";

/** ดอกไม้/ใบไม้แห้งหนึ่งครั้งที่พนักงานได้รับ — **ไม่มีฟิลด์ผู้ให้โดยตั้งใจ** */
export type FlowerReceived = {
  id: string;
  kind: GrantKind;
  /** จำนวนกลีบ เก็บเป็นบวกเสมอทั้งสองชนิด เครื่องหมายอยู่ที่ kind */
  petals: number;
  /** ข้อความ — มีเฉพาะดอกไม้ ใบไม้แห้งต้องรอหัวหน้าเปิดที่ช่องเสียงจากสมาชิก */
  message: string;
  photos: string[];
  /** สีดอก = แรงค์ผู้ให้ ณ ตอนให้ · ว่าง = ดอกครีม (ไม่ระบุตัวตน/รับฝาก) */
  rank: string;
  invoiceNumber: string;
  createdAt: string;
};

/** ค่าที่เอาไปรวมได้ — ใบไม้แห้งคือค่าติดลบของจำนวนเท่ากัน */
export function signedPetals(item: { kind: GrantKind; petals: number }): number {
  return item.kind === "leaf" ? -item.petals : item.petals;
}

/** "3 ดอก 2 กลีบ" / "4 กลีบ" — รับค่าติดลบได้ ("−2 กลีบ") */
export function bloomLabel(petals: number): string {
  const sign = petals < 0 ? "−" : "";
  const safe = Math.abs(Math.floor(Number.isFinite(petals) ? petals : 0));
  const flowers = Math.floor(safe / PETALS_PER_FLOWER);
  const rest = safe % PETALS_PER_FLOWER;
  if (flowers && rest) return `${sign}${flowers} ดอก ${rest} กลีบ`;
  if (flowers) return `${sign}${flowers} ดอก`;
  return `${sign}${rest} กลีบ`;
}

/**
 * ดอกไม้ที่พนักงานคนหนึ่ง "ควรจะได้" ในเดือนนั้น
 *
 * ครึ่งหนึ่งของกลีบที่บิลทั้งเดือนแจกได้ หารจำนวนพนักงาน — ตัวเลขนี้ไม่ใช่คะแนน
 * แต่เป็นเส้นให้หัวหน้าเห็นว่าใครได้น้อยกว่าที่ควร แล้วค่อยไปคุยว่าเกิดอะไรขึ้น
 */
export function monthlyTargetPetals(potentialPetals: number, staffCount: number): number {
  const potential = Math.max(0, Math.floor(potentialPetals));
  const people = Math.max(1, Math.floor(staffCount));
  return Math.floor((potential * TARGET_SHARE_OF_POTENTIAL) / people);
}

export type GardenSummary = {
  /** กลีบจากดอกไม้ */
  petalsGiven: number;
  /** กลีบจากใบไม้แห้ง (เก็บเป็นบวก แสดงผลเป็นลบ) */
  petalsDocked: number;
  /** หักล้างกันแล้ว — ตัวเลขที่เอาไปเทียบกับเกณฑ์ */
  netPetals: number;
  bouquets: number;
  leaves: number;
};

export function summarise(items: FlowerReceived[]): GardenSummary {
  const flowers = items.filter((item) => item.kind !== "leaf");
  const leaves = items.filter((item) => item.kind === "leaf");
  const petalsGiven = flowers.reduce((sum, item) => sum + item.petals, 0);
  const petalsDocked = leaves.reduce((sum, item) => sum + item.petals, 0);
  return {
    petalsGiven,
    petalsDocked,
    netPetals: petalsGiven - petalsDocked,
    bouquets: flowers.length,
    leaves: leaves.length
  };
}

/** ได้เท่าไหร่เทียบกับเกณฑ์ — 100 = พอดีเส้น. เกณฑ์ 0 (เดือนที่ยังไม่มีบิล) คืนค่า null */
export function targetPercent(netPetals: number, targetPetals: number): number | null {
  if (targetPetals <= 0) return null;
  return Math.round((netPetals / targetPetals) * 100);
}

/** ใหม่ก่อนเสมอ — สวนดอกไม้อ่านจากบนลงล่าง ของล่าสุดต้องอยู่บนสุด */
export function newestFirst(items: FlowerReceived[]): FlowerReceived[] {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** YYYY-MM ของเวลาไทย — ใช้ตัดรอบเดือนให้ตรงกับที่คนอ่านเข้าใจ */
export function bangkokMonth(iso: string | number | Date = Date.now()): string {
  const ms = iso instanceof Date ? iso.getTime() : typeof iso === "number" ? iso : Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + 7 * 3600 * 1000).toISOString().slice(0, 7);
}

export function flowerDateLabel(createdAtIso: string): string {
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
