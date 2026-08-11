// Stock Run — งานตรวจนับ Stock รายครั้ง (Weekly · อุปกรณ์/Sleeve, Monthly · Single card).
//
// ทำไมต้องมีไฟล์นี้: เดิม checklist งานประจำสัปดาห์/เดือน บันทึกลง work-record window เดียว
// ต่อรอบ (owner:"team") — กดส่งแล้ว "ค้างหน้า checklist" ไม่มีการตรวจรับ ไม่มีประวัติรายครั้ง
// และแก้ checklist ทีหลังทำให้ของเก่าเปลี่ยนตาม. ระบบใหม่เก็บเป็น "Run" ถาวรรายครั้ง เหมือน
// ระบบ Assign Work (open → submit → review) พร้อม snapshot ของ checklist ณ เวลาสร้าง Run และ
// ประวัติการตรวจทุกครั้ง.
//
// ไฟล์นี้เป็น pure logic (ไม่มี "use client" / "server-only") จึงใช้ได้ทั้งฝั่ง server, client
// และ unit test.

export type StockRunKind = "weekly" | "monthly";

export type StockRunStatus =
  | "assigned" // แอดมินมอบหมายแล้ว รอพนักงานเริ่มนับ
  | "in_progress" // พนักงานกด "เริ่มตรวจนับ" แล้ว
  | "submitted" // พนักงานกด "ส่งงานตรวจนับ" แล้ว รอแอดมินตรวจ
  | "needs_revision" // แอดมินให้แก้ไข
  | "approved"; // แอดมินอนุมัติ (สถานะสุดท้าย)

// หนึ่งบรรทัดของการนับ: ยอดในระบบ StoreHub เทียบกับที่นับจริง → ผลต่าง
export type StockCountLine = {
  name: string;
  system: number | null; // ยอดระบบ (StoreHub)
  counted: number | null; // นับจริง
};

// ประวัติการตรวจแต่ละครั้ง (เก็บทุกครั้งที่แอดมินอนุมัติ/ให้แก้)
export type StockApprovalEntry = {
  by: string; // อีเมลผู้ตรวจ
  status: "approved" | "needs_revision";
  note: string;
  at: string; // ISO datetime
};

// snapshot ของรายการ checklist ณ เวลาสร้าง Run — ประวัติเดิมไม่เปลี่ยนเมื่อ checklist ถูกแก้ทีหลัง
export type StockChecklistSnapshot = {
  title: string;
  items: string[];
};

export type StockRun = {
  id: string;
  kind: StockRunKind;
  branch: string;
  staffCode: string; // ผู้รับผิดชอบ
  assignedBy: string; // อีเมลแอดมินที่มอบหมาย
  periodLabel: string; // รอบงาน เช่น 2026-W32 (สัปดาห์) หรือ 2026-08 (เดือน)
  dueDate: string; // กำหนดส่ง (YYYY-MM-DD) — "" = ไม่กำหนด
  status: StockRunStatus;
  checklist: StockChecklistSnapshot; // snapshot ณ สร้าง Run
  checklistDone: Record<string, boolean>; // ติ๊กตาม index ของ snapshot ("0","1",...)
  counts: StockCountLine[]; // รายการนับ + ผลต่าง
  lowStock: string; // รายการใกล้หมด
  refill: string; // รายการเติม
  reorder: string; // รายการสั่งเพิ่ม
  note: string; // หมายเหตุ
  evidence: string[]; // รูปหลักฐาน (URL)
  approvals: StockApprovalEntry[]; // ประวัติการตรวจทุกครั้ง
  createdAt: string;
  startedAt: string; // เวลาที่กดเริ่มตรวจนับ ("" = ยังไม่เริ่ม)
  submittedAt: string; // เวลาที่กดส่งล่าสุด ("" = ยังไม่ส่ง)
  reviewedAt: string; // เวลาที่แอดมินตรวจล่าสุด
};

export const stockRunKindLabel: Record<StockRunKind, string> = {
  weekly: "งานประจำสัปดาห์ · Stock อุปกรณ์ / Sleeve",
  monthly: "งานประจำเดือน · Stock Single card"
};

export const stockRunStatusLabel: Record<StockRunStatus, string> = {
  assigned: "รอเริ่มตรวจนับ",
  in_progress: "กำลังตรวจนับ",
  submitted: "ส่งแล้ว รอตรวจ",
  needs_revision: "ต้องแก้ไข",
  approved: "อนุมัติแล้ว"
};

// ใช้ utility class สีสถานะชุดเดียวกับทั้ง dashboard
export const stockRunStatusClass: Record<StockRunStatus, string> = {
  assigned: "workflow-status-white",
  in_progress: "workflow-status-white",
  submitted: "workflow-status-orange",
  needs_revision: "workflow-status-red",
  approved: "workflow-status-green"
};

export function emptyCountLine(): StockCountLine {
  return { name: "", system: null, counted: null };
}

/** ผลต่าง = นับจริง − ระบบ. คืน null เมื่อกรอกไม่ครบทั้งสองช่อง. */
export function lineDiff(line: StockCountLine): number | null {
  if (line.system === null || line.counted === null) return null;
  return line.counted - line.system;
}

/** เก็บเฉพาะบรรทัดที่มีชื่อสินค้า (บรรทัดว่างเป็นแค่ช่องกรอกเปล่า). */
export function meaningfulCountLines(counts: StockCountLine[]): StockCountLine[] {
  return counts.filter((line) => line.name.trim().length > 0);
}

/** มีรายการไม่ตรงหรือไม่ (ผลต่าง ≠ 0) — ใช้เตือนหัวหน้าให้ตรวจก่อนอนุมัติ. */
export function hasDiscrepancy(counts: StockCountLine[]): boolean {
  return meaningfulCountLines(counts).some((line) => {
    const diff = lineDiff(line);
    return diff !== null && diff !== 0;
  });
}

/** ยังทำงานได้ (พนักงานยังกรอก/ส่งได้) เฉพาะสถานะ assigned / in_progress / needs_revision. */
export function isStockRunActionable(status: StockRunStatus): boolean {
  return status === "assigned" || status === "in_progress" || status === "needs_revision";
}

/** แอดมินตรวจได้เมื่อพนักงานส่งงานเข้ามาแล้ว (submitted หรือ needs_revision ที่ส่งซ้ำ). */
export function isStockRunReviewable(status: StockRunStatus): boolean {
  return status === "submitted";
}

/**
 * ส่งงานตรวจนับได้เมื่อ: นับอย่างน้อย 1 รายการ (มีชื่อ + ตัวเลขนับจริง) และแนบรูปหลักฐาน
 * อย่างน้อย 1 รูป. เหมือนกฎ Assign Work — ปุ่มส่งจะถูก disable จนกว่าจะแนบหลักฐาน.
 */
export function canSubmitStockRun(run: Pick<StockRun, "counts" | "evidence">): boolean {
  const hasCount = meaningfulCountLines(run.counts).some((line) => line.counted !== null);
  const hasEvidence = run.evidence.some((url) => url.trim().length > 0);
  return hasCount && hasEvidence;
}

/** เหตุผลที่ยังส่งไม่ได้ (สำหรับแสดง hint) — คืน "" เมื่อส่งได้แล้ว. */
export function submitBlockReason(run: Pick<StockRun, "counts" | "evidence">): string {
  const hasCount = meaningfulCountLines(run.counts).some((line) => line.counted !== null);
  if (!hasCount) return "กรอกรายการนับอย่างน้อย 1 รายการ (ชื่อสินค้า + จำนวนที่นับจริง) ก่อนส่งงาน";
  const hasEvidence = run.evidence.some((url) => url.trim().length > 0);
  if (!hasEvidence) return "แนบรูปหลักฐานอย่างน้อย 1 รูปก่อนส่งงาน";
  return "";
}

export type NewStockRunInput = {
  id: string;
  kind: StockRunKind;
  branch: string;
  staffCode: string;
  assignedBy: string;
  periodLabel: string;
  dueDate?: string;
  checklist: StockChecklistSnapshot;
  createdAt: string;
};

/** สร้าง Run ใหม่ (สถานะเริ่มต้น assigned) พร้อม snapshot ของ checklist. */
export function buildStockRun(input: NewStockRunInput): StockRun {
  return {
    id: input.id,
    kind: input.kind,
    branch: input.branch,
    staffCode: input.staffCode,
    assignedBy: input.assignedBy,
    periodLabel: input.periodLabel,
    dueDate: input.dueDate ?? "",
    status: "assigned",
    checklist: { title: input.checklist.title, items: [...input.checklist.items] },
    checklistDone: {},
    counts: [],
    lowStock: "",
    refill: "",
    reorder: "",
    note: "",
    evidence: [],
    approvals: [],
    createdAt: input.createdAt,
    startedAt: "",
    submittedAt: "",
    reviewedAt: ""
  };
}

/** เพิ่มประวัติการตรวจ 1 รายการ (immutable — คืน array ใหม่). */
export function appendApproval(approvals: StockApprovalEntry[], entry: StockApprovalEntry): StockApprovalEntry[] {
  return [...approvals, entry];
}

// ── ป้ายรอบงาน (period label) ────────────────────────────────────────────────

/** รหัสสัปดาห์แบบ ISO เช่น 2026-W32 (ใช้เป็นรอบของงานประจำสัปดาห์). */
export function isoWeekLabel(date = new Date()): string {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** รหัสเดือน เช่น 2026-08 (ใช้เป็นรอบของงานประจำเดือน). */
export function monthLabel(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function defaultPeriodLabel(kind: StockRunKind, date = new Date()): string {
  return kind === "weekly" ? isoWeekLabel(date) : monthLabel(date);
}

// เรียงงานล่าสุดขึ้นก่อน (createdAt มากสุดก่อน)
export function sortStockRunsNewestFirst(runs: StockRun[]): StockRun[] {
  return [...runs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}
