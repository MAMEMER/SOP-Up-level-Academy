// Branch operating config — used by the Stock KPI to detect a "slow morning count"
// (นับ stock ช้า): a morning stocktake that starts after the store opens is allowed
// up to `stockCountGraceHours` into the shift; starting later than that = slowCount.

export type BranchConfig = {
  key: string;
  displayName: string;
  /** ชื่อสั้นสำหรับป้ายบนตาราง (คอลัมน์แคบ) */
  shortName: string;
  /** ตัวย่อ 1–2 ตัวอักษรสำหรับป้ายในช่องตาราง */
  tag: string;
  /** สีประจำสาขา — ใช้แยกสาขาด้วยสายตาในตารางกะ */
  color: string;
  /** store open time HH:mm (Asia/Bangkok) on weekdays (Mon–Fri) */
  openTimeWeekday: string;
  /** store open time HH:mm on weekends (Sat–Sun) */
  openTimeWeekend: string;
  /**
   * เวลาปิดร้าน HH:mm — ใส่เมื่อรู้แน่ชัด ระบบจะเตือนวันที่ไม่มีใครอยู่ถึงเวลาปิด.
   * สาขาที่ยังไม่ระบุ = ไม่เช็คข้อนี้ (ดีกว่าเตือนผิดทั้งตาราง)
   */
  closeTime?: string;
  /**
   * เวลาเข้างานที่เลือกได้ของแต่ละกะ (ค่าแรก = ค่าเริ่มต้น). ทุกกะยาว 9 ชั่วโมงเท่ากันทุกสาขา —
   * ต่างกันแค่เวลาเข้า เพราะร้านแต่ละสาขาเปิด–ปิดไม่พร้อมกัน.
   */
  shiftStarts: { s1: string[]; s2: string[] };
  /** hours after shift start a morning stock count may still begin without penalty */
  stockCountGraceHours: number;
  /** StoreHub store id — ใช้เรียก GET /inventory/{storeId} เพื่อดูของที่ต้องสั่ง */
  storeHubStoreId?: string;
  /** ยอดสั่งซื้อขั้นต่ำต่อรอบ (บาท) — Makro ต้องยอด 1,000+ ถึงจะสั่งได้ */
  supplyMinOrderValue?: number;
};

export const branchConfigs: BranchConfig[] = [
  {
    key: "bangkae",
    displayName: "Up Level Academy (บางแค)",
    shortName: "บางแค",
    tag: "บค",
    color: "#FF8C42", // ส้ม = สาขาแม่
    openTimeWeekday: "11:00", // จ–ศ กะแรก 11:00
    openTimeWeekend: "09:00", // ส–อา กะแรก 09:00
    shiftStarts: { s1: ["09:00", "11:00"], s2: ["11:30", "13:00"] },
    stockCountGraceHours: 4,
    storeHubStoreId: "6a268170c008ab000760e21a", // "Up level Academy" (บางแค) — สาขาหลักใน StoreHub
    supplyMinOrderValue: 1000
  },
  {
    // สาขา 2 — เสนาเฟสต์: ร้านเปิด 10:00–22:00 ทุกวัน, พนักงานเข้างาน 09:30 (ก่อนเปิดครึ่งชั่วโมง)
    // กะ 9 ชั่วโมงเท่าบางแค → ก1 09:30–18:30 · ก2 13:00–22:00 (ปิดร้านพอดี)
    key: "senafest",
    displayName: "Up Level Academy (เสนาเฟสต์)",
    shortName: "เสนาเฟสต์",
    tag: "สฟ",
    color: "#2F80ED", // น้ำเงิน = สาขา 2
    openTimeWeekday: "10:00",
    openTimeWeekend: "10:00",
    closeTime: "22:00",
    shiftStarts: { s1: ["09:30", "10:00"], s2: ["12:30", "13:00"] },
    stockCountGraceHours: 4,
    supplyMinOrderValue: 1000
  }
];

/** สาขาทั้งหมด เรียงตามลำดับที่ใช้บนหน้าจอ */
export function allBranchKeys(): string[] {
  return branchConfigs.map((branch) => branch.key);
}

export function branchShortName(key: string): string {
  return branchConfigs.find((branch) => branch.key === key)?.shortName ?? key;
}

export function branchColor(key: string): string {
  return branchConfigs.find((branch) => branch.key === key)?.color ?? "#5C5D7A";
}

export function branchTag(key: string): string {
  return branchConfigs.find((branch) => branch.key === key)?.tag ?? key.slice(0, 2);
}

export function branchConfig(key: string): BranchConfig {
  return branchConfigs.find((branch) => branch.key === key) ?? branchConfigs[0];
}

/** Returns the branch open time HH:mm for a given YYYY-MM-DD (weekend vs weekday). */
export function openTimeFor(branchKey: string, workDate: string): string {
  const config = branchConfig(branchKey);
  // Use local noon so the +07 date never rolls into the previous UTC day.
  const day = new Date(`${workDate}T12:00:00+07:00`).getUTCDay(); // 0=Sun … 6=Sat
  const isWeekend = day === 0 || day === 6;
  return isWeekend ? config.openTimeWeekend : config.openTimeWeekday;
}

/**
 * A morning stock count is "slow" when it was started, but started later than
 * `graceHours` after the scheduled shift start (i.e. it dragged past the allowed
 * morning window). Returns false when there is no start timestamp.
 */
export function isSlowMorningCount(input: {
  scheduledStart: string;
  startedAt?: string;
  graceHours: number;
}): boolean {
  if (!input.startedAt) return false;
  const start = Date.parse(input.scheduledStart);
  const started = Date.parse(input.startedAt);
  if (!Number.isFinite(start) || !Number.isFinite(started)) return false;
  const deadline = start + input.graceHours * 60 * 60 * 1000;
  return started > deadline;
}
