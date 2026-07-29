import type { StockCountRecord } from "./performance-score.ts";

// Owner-entered stock checks — the input for the Stock KPI category.
//
// The Stock score used to be derived from a StoreHub Stock Take CSV read off a path on
// the owner's Mac. That path does not exist on the server, so on production it always
// read nothing and every employee scored a free 20/20. StoreHub has no stocktake
// endpoint to replace it with, so the owner records the outcome here instead: who was
// responsible, what was counted, whether it matched, and a screenshot of the StoreHub
// screen as proof.
//
// Storage lives in lib/stock-check-store.ts. This half stays free of server-only imports
// so the scoring conversion can be unit-tested.

export const STOCK_CHECK_COLLECTION = "sop_stock_checks";

export const STOREHUB_STOCKTAKE_URL = "https://uplevel.storehubhq.com/stocks/stocktakes";

/** What the owner saw when comparing the count against StoreHub. */
export type StockCheckResult = StockCountRecord["discrepancyStatus"];

export const stockCheckResultOptions: Array<{ value: StockCheckResult; label: string; hint: string }> = [
  { value: "matched", label: "ตรง", hint: "ยอดนับตรงกับ StoreHub — ไม่หักคะแนน" },
  { value: "resolved", label: "ไม่ตรง แต่แก้ได้ใน 24 ชม.", hint: "หาสาเหตุเจอและปรับให้ตรงแล้ว — ไม่หักคะแนน" },
  { value: "real_loss", label: "ไม่ตรงจริง (ของหาย/ขาด)", hint: "หัก 2 คะแนน (เริ่มหักจริง 1 ส.ค. 2026)" },
  { value: "fraud_review", label: "ต้องให้เจ้าของตรวจสอบ", hint: "ไม่หักคะแนนอัตโนมัติ แต่ติดธงรอตรวจ" },
  { value: "not_counted", label: "ไม่ได้นับ", hint: "หัก 10 คะแนน (ครั้งที่ 3 เป็นต้นไปหัก 5)" }
];

export const stockCountTypeOptions: Array<{ value: StockCountRecord["countType"]; label: string }> = [
  { value: "weekly", label: "รายสัปดาห์ — อุปกรณ์ / Sleeve" },
  { value: "monthly", label: "รายเดือน — Single card" }
];

export type StockCheckRecord = {
  id: string;
  /** the day the count was due / done */
  workDate: string;
  /** staff code of whoever was responsible that day */
  employeeName: string;
  countType: StockCountRecord["countType"];
  /** what was counted, e.g. "Sleeve", "Pokémon single" */
  category: string;
  result: StockCheckResult;
  /** true when the count started later than the branch's morning window (-2) */
  slowCount: boolean;
  note: string;
  /** screenshot of the StoreHub stocktake screen, or a link to it */
  evidence?: string;
  recordedAt: string;
  recordedBy: string;
};

export type StockCheckRecordInput = Omit<StockCheckRecord, "id" | "recordedAt">;

function stockRecordId(input: { workDate: string; employeeName: string; category: string }, recordedAt: string) {
  return `stock-${input.workDate}-${input.employeeName}-${input.category}-${recordedAt}`.replace(/[^a-zA-Z0-9-]/g, "-");
}

export function buildStockCheckRecord(input: StockCheckRecordInput, recordedAt = new Date().toISOString()): StockCheckRecord {
  const category = input.category.trim() || (input.countType === "weekly" ? "อุปกรณ์ / Sleeve" : "Single card");
  return {
    ...input,
    category,
    note: input.note.trim(),
    evidence: (input.evidence || "").trim() || undefined,
    recordedAt,
    id: stockRecordId({ ...input, category }, recordedAt)
  };
}

/**
 * Converts the owner's entries into the shape the KPI engine scores.
 *
 * Quantities are not carried: the owner records the verdict ("ตรง / ไม่ตรง / ไม่ได้นับ"),
 * not a stock count, and calculateStockScore only reads discrepancyStatus and slowCount.
 */
export function stockCheckRecordsToCounts(records: StockCheckRecord[]): StockCountRecord[] {
  return records.map((record) => ({
    employeeName: record.employeeName,
    owner: record.employeeName,
    category: record.category,
    countType: record.countType,
    dueDate: record.workDate,
    submittedAt: record.recordedAt,
    expectedQuantity: 0,
    actualQuantity: 0,
    discrepancyStatus: record.result,
    // an owner marking "แก้ได้ใน 24 ชม." is asserting exactly that
    resolvedWithin24Hours: record.result === "resolved",
    slowCount: record.slowCount,
    source: "manual" as const
  }));
}

export function stockCheckRecordsForDate(records: StockCheckRecord[], workDate: string) {
  return records.filter((record) => record.workDate === workDate);
}
