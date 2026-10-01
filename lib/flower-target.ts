// เป้าดอกไม้ขั้นต่ำรายเดือน — เจ้าของตั้งเองที่ /admin/flower-target
//
// กติกาที่แชมป์เคาะ (28 ก.ย. 2569):
//  - นับตั้งแต่วันที่มีระบบดอกไม้ (บิลแรก 17 ก.ย. 2569) ตัดรอบทุกสิ้นเดือน
//  - พนักงาน **แต่ละคน** ต้องได้ดอกไม้อย่างน้อย X% ของยอดขายที่เข้าร้านในเดือนนั้น
//    เริ่มที่ 10% — ยอดขาย 10 ฿ = 1 กลีบ ดังนั้นเป้าเป็นกลีบ = X% ของกลีบที่บิลทั้งเดือนแจกได้
//  - **ยังไม่มีบทลงโทษ** ไม่ผูก KPI ไม่หักเงิน — เป็นแถบเตือนบนหน้าพนักงานอย่างเดียว
//  - ใครได้ดอกไม้มากที่สุดในเดือนได้รางวัลพิเศษ (เจ้าของพิมพ์รางวัลเองได้)

export const FLOWER_TARGET_DOC = { collection: "sop_settings", id: "flower_target" } as const;

/** วันแรกที่มีบิลในระบบดอกไม้ — ก่อนหน้านี้ไม่มีบิลให้ลูกค้าให้ดอกไม้ได้ */
export const FLOWER_SYSTEM_START = "2026-09-17";

export type FlowerTargetSettings = {
  /** % ของยอดขายทั้งร้านในเดือน ที่พนักงานแต่ละคนควรได้เป็นดอกไม้ */
  minPercentOfSales: number;
  /** YYYY-MM-DD — บิลก่อนวันนี้ไม่นับเข้าเป้า */
  startDate: string;
  /** รางวัลของคนที่ได้ดอกไม้มากที่สุด — ว่าง = "รางวัลพิเศษ" เฉยๆ */
  prize: string;
  updatedAt?: string;
  updatedBy?: string;
};

export const DEFAULT_FLOWER_TARGET: FlowerTargetSettings = {
  minPercentOfSales: 10,
  startDate: FLOWER_SYSTEM_START,
  prize: ""
};

const clampPercent = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_FLOWER_TARGET.minPercentOfSales;
  return Math.min(100, Math.max(0, Math.round(n * 10) / 10));
};

/** รับอะไรมาก็ได้ (Firestore / body ของ request) คืนค่าที่ใช้ได้เสมอ */
export function sanitizeFlowerTarget(raw: unknown): FlowerTargetSettings {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const start = typeof row.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.startDate) ? row.startDate : FLOWER_SYSTEM_START;
  return {
    minPercentOfSales: row.minPercentOfSales === undefined ? DEFAULT_FLOWER_TARGET.minPercentOfSales : clampPercent(row.minPercentOfSales),
    startDate: start,
    prize: typeof row.prize === "string" ? row.prize.trim().slice(0, 120) : "",
    ...(typeof row.updatedAt === "string" ? { updatedAt: row.updatedAt } : {}),
    ...(typeof row.updatedBy === "string" ? { updatedBy: row.updatedBy } : {})
  };
}

/** เป้ากลีบต่อคนของเดือน — ปัดลง ไม่ให้เป้าสูงเกินจริงแม้แต่กลีบเดียว */
export function targetPetalsPerPerson(potentialPetals: number, minPercentOfSales: number): number {
  const potential = Math.max(0, Math.floor(Number(potentialPetals) || 0));
  return Math.floor((potential * clampPercent(minPercentOfSales)) / 100);
}

/** YYYY-MM-DD ของเวลาไทย */
export function bangkokDate(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

/** บิลนี้นับเข้าเป้าของเดือน `month` ไหม — ต้องอยู่ในเดือนนั้น และไม่ก่อนวันเริ่มระบบ */
export function billCounts(transactionTime: string, month: string, startDate: string): boolean {
  const day = bangkokDate(transactionTime);
  return Boolean(day) && day.slice(0, 7) === month && day >= startDate;
}

export type LeaderRow = { staffCode: string; name: string; netPetals: number; rank: number };

/**
 * อันดับดอกไม้ของเดือน — ทุกคนในตารางกะติดอันดับแม้ยังได้ 0 (ไม่งั้นคนที่ยังไม่ได้เลยจะหายไปเงียบๆ)
 * คะแนนเท่ากันได้อันดับเท่ากัน
 */
export function leaderboard(
  roster: Array<{ code: string; name: string }>,
  netByCode: Map<string, number>
): LeaderRow[] {
  const rows = roster
    .map((person) => ({ staffCode: person.code, name: person.name, netPetals: netByCode.get(person.code) ?? 0 }))
    .sort((a, b) => b.netPetals - a.netPetals || a.name.localeCompare(b.name, "th"));
  let rank = 0;
  let prev: number | null = null;
  return rows.map((row, index) => {
    if (row.netPetals !== prev) rank = index + 1;
    prev = row.netPetals;
    return { ...row, rank };
  });
}

/** วันที่เหลือของเดือน (นับวันนี้ด้วย) ตามเวลาไทย — ใช้บอกพนักงานว่ายังทันไหม */
export function daysLeftInMonth(now: number = Date.now()): number {
  const local = new Date(now + 7 * 3600 * 1000);
  const last = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0)).getUTCDate();
  return last - local.getUTCDate() + 1;
}

/** YYYY-MM ที่ใช้ได้จริง — กันค่าแปลกๆ จาก query string */
export function isFlowerMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/**
 * ทุกเดือนตั้งแต่เริ่มระบบดอกไม้จนถึงเดือนปัจจุบัน (ตามเวลาไทย) — ใหม่ก่อน
 * ใช้ทำแท็บดูย้อนหลัง เดือนก่อนเริ่มระบบไม่มีบิลให้ดู จึงไม่ต้องโชว์
 */
export function flowerMonthsSince(startDate: string, now: number = Date.now()): string[] {
  const local = new Date(now + 7 * 3600 * 1000);
  let y = local.getUTCFullYear();
  let m = local.getUTCMonth() + 1;
  const start = /^\d{4}-\d{2}/.test(startDate) ? startDate.slice(0, 7) : FLOWER_SYSTEM_START.slice(0, 7);
  const months: string[] = [];
  for (let guard = 0; guard < 120; guard += 1) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (key < start) break;
    months.push(key);
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return months;
}

/** "ก.ย. 2569" */
export function thaiMonthLabel(month: string): string {
  if (!isFlowerMonth(month)) return month;
  return new Intl.DateTimeFormat("th-TH", { month: "short", year: "numeric", timeZone: "Asia/Bangkok" })
    .format(new Date(`${month}-15T12:00:00+07:00`));
}
