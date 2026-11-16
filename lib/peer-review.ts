// ประเมิน 360 องศารายเดือน (ระบบ KPI ใหม่ หมวด ค2) — วัดกลุ่ม 3 ทีมเวิร์ก.
//
// กติกาจากเอกสาร "ระบบ KPI และแผนพัฒนา" (12 พ.ย. 2569):
//  - 6 ข้อ คะแนน 4 ระดับ ไม่มีตัวเลือกกลางๆ: 4 = 100 · 3 = 67 · 2 = 33 · 1 = 0
//  - ให้ 1 หรือ 4 ต้องเขียนตัวอย่างหนึ่งประโยค
//  - คนประเมิน = ทุกคนที่ทำงานกะเดียวกันในเดือนนั้น (รวมผู้บริหาร)
//  - ผู้ถูกประเมินไม่เห็นว่าใครให้เท่าไร · ผู้บริหารเห็นทั้งหมด
//  - คะแนน 360 = ค่าเฉลี่ยทุกข้อจากทุกคนที่ประเมิน
//
// ยังไม่ผูก performance-score / เงินเดือน — เป็นข้อมูลของ KPI ใหม่ที่เริ่มทดลอง ธ.ค. 2569.
// pure logic ล้วน; เก็บจริงที่ Firestore `sop_peer_reviews` ผ่าน peer-review-store.ts.

export const PEER_REVIEWS_COLLECTION = "sop_peer_reviews";

export type PeerReviewItem = { id: string; text: string; covers: string };

export const peerReviewItems: PeerReviewItem[] = [
  { id: "q1", text: "ช่วยงาน แลกกะ และแบ่งปันความรู้ให้เพื่อน", covers: "3.2, 3.10, 3.11" },
  { id: "q2", text: "เตือนอย่างสุภาพเมื่อเห็นใครทำผิดหรือหลงลืม", covers: "3.1, 3.3" },
  { id: "q3", text: "ส่งต่องานครบ ไม่ทิ้งงานค้างให้กะถัดไป", covers: "3.8" },
  { id: "q4", text: "ยอมรับผิด รายงานความผิดพลาดของตัวเอง และรับฟีดแบ็กได้", covers: "3.9, 3.13" },
  { id: "q5", text: "แจ้งของพังหรือสิ่งผิดปกติ และเสนอทางแก้หรือไอเดียใหม่", covers: "3.4–3.7, 3.14" },
  { id: "q6", text: "เป็นแบบอย่าง และกล้านำเมื่อเกิดปัญหาโดยไม่รอคำสั่ง", covers: "ทัศนคติพื้นฐานข้อ 11" }
];

export type Rating = 1 | 2 | 3 | 4;

export const ratingOptions: { value: Rating; label: string }[] = [
  { value: 4, label: "ทุกครั้ง" },
  { value: 3, label: "ส่วนใหญ่" },
  { value: 2, label: "บางครั้ง" },
  { value: 1, label: "ไม่เห็นเลย" }
];

const RATING_POINTS: Record<Rating, number> = { 4: 100, 3: 67, 2: 33, 1: 0 };

export function ratingPoints(rating: Rating): number {
  return RATING_POINTS[rating];
}

export type PeerReviewRecord = {
  id: string;
  /** เดือนที่ประเมิน "YYYY-MM" */
  period: string;
  raterCode: string;
  raterEmail: string;
  raterName?: string;
  rateeCode: string;
  ratings: Record<string, Rating>;
  /** ตัวอย่างประกอบ — บังคับเมื่อให้ 1 หรือ 4 */
  examples: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export function peerReviewId(period: string, raterCode: string, rateeCode: string): string {
  return `${period}__${raterCode}__${rateeCode}`.replace(/[^a-zA-Z0-9_\-]/g, "-");
}

export function isPeriod(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
}

/** เดือนก่อนหน้า "YYYY-MM" */
export function previousPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * เดือนที่ยังเปิดให้ประเมิน: เดือนนี้ และเดือนที่แล้วจนถึงวันที่ 7 (ให้เวลาเก็บตกหลังสิ้นเดือน)
 * today = "YYYY-MM-DD" เวลาไทย
 */
export function openPeriods(today: string): string[] {
  const current = today.slice(0, 7);
  const day = Number(today.slice(8, 10));
  return day <= 7 ? [current, previousPeriod(current)] : [current];
}

export type ShiftCellLite = { staffCode: string; workDate: string; branch: string };

/** คนที่เคยทำงานวันเดียวกัน สาขาเดียวกัน กับ raterCode ในเดือนนั้น (ไม่รวมตัวเอง) */
export function coworkersOf(raterCode: string, period: string, cells: ShiftCellLite[]): string[] {
  const inMonth = cells.filter((cell) => cell.workDate.startsWith(period));
  const myDays = new Set(
    inMonth.filter((cell) => cell.staffCode === raterCode).map((cell) => `${cell.branch}__${cell.workDate}`)
  );
  const found = new Set<string>();
  for (const cell of inMonth) {
    if (cell.staffCode !== raterCode && myDays.has(`${cell.branch}__${cell.workDate}`)) found.add(cell.staffCode);
  }
  return [...found].sort();
}

export type PeerReviewDraft = { ratings: Record<string, number>; examples: Record<string, string> };

/** ข้อความ error ภาษาไทย หรือ null เมื่อผ่าน */
export function validatePeerReview(draft: PeerReviewDraft): string | null {
  for (const item of peerReviewItems) {
    const value = draft.ratings[item.id];
    if (![1, 2, 3, 4].includes(value)) return `ยังไม่ได้ให้คะแนนข้อ "${item.text}"`;
    if ((value === 1 || value === 4) && !(draft.examples[item.id] || "").trim()) {
      return `ให้ ${value} ในข้อ "${item.text}" ต้องเขียนตัวอย่างหนึ่งประโยค`;
    }
  }
  return null;
}

export type PeerScore = {
  rateeCode: string;
  raters: number;
  /** 0–100 หรือ null เมื่อยังไม่มีใครประเมิน */
  score: number | null;
  byItem: Record<string, number | null>;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

/** คะแนน 360 ของแต่ละคน = ค่าเฉลี่ยทุกข้อจากทุกคนที่ประเมิน */
export function scorePeerReviews(records: PeerReviewRecord[], rateeCode: string): PeerScore {
  const mine = records.filter((record) => record.rateeCode === rateeCode);
  const byItem: Record<string, number | null> = {};
  const all: number[] = [];
  for (const item of peerReviewItems) {
    const points = mine
      .map((record) => record.ratings[item.id])
      .filter((value): value is Rating => [1, 2, 3, 4].includes(value as number))
      .map(ratingPoints);
    byItem[item.id] = points.length ? round1(points.reduce((a, b) => a + b, 0) / points.length) : null;
    all.push(...points);
  }
  return {
    rateeCode,
    raters: mine.length,
    score: all.length ? round1(all.reduce((a, b) => a + b, 0) / all.length) : null,
    byItem
  };
}

/** พนักงานเห็นผลของตัวเองเมื่อมีคนประเมินอย่างน้อยเท่านี้ — กันเดาได้ว่าใครให้เท่าไร */
export const MIN_RATERS_TO_SHOW = 2;
