// CSV exports for /admin/performance-score — a monthly staff-score sheet (one row per
// person) and a line-by-line deduction sheet. Both are built straight from the same
// EmployeePerformanceScore rows the page renders, so every number matches the screen and
// the detail sheet's deductions sum back to the points each person lost in the summary.
//
// Pure functions only (no server-only / Firestore imports) so they stay unit-testable.

import type { DeductionRecord, EmployeePerformanceScore, ScoreCategoryKey } from "./performance-score.ts";
import { branchShortName } from "./store-config.ts";
import { branchFor, displayNameFor, employmentTypeFor } from "./employee-directory.ts";

const CATEGORY_TH: Record<ScoreCategoryKey, string> = {
  attendance: "การเข้างาน",
  stock: "สต็อก",
  checklist: "Checklist",
  customer_service: "บริการลูกค้า",
  assigned_work: "งานที่มอบหมาย"
};

/** First YYYY-MM-DD found in a deduction detail string, or "" when it carries no date. */
export function extractDate(detail: string): string {
  const match = detail.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

function serviceItemTh(reason: string): string {
  const bucket = reason.startsWith("event_response") ? "กิจกรรม/ตอบลูกค้า" : "feedback ลูกค้า";
  const severity = reason.endsWith("fixed_immediately")
    ? "แก้ไขทันที"
    : reason.endsWith("repeated")
      ? "ซ้ำเรื่องเดิม"
      : "รุนแรง";
  return `ปัญหาบริการ: ${bucket} (${severity})`;
}

function assignedItemTh(reason: string): string {
  if (reason === "late_one_day") return "งานที่มอบหมาย: ส่งช้า 1 วัน";
  if (reason === "not_finished") return "งานที่มอบหมาย: ไม่เสร็จ / เกินกำหนด";
  return "งานที่มอบหมาย";
}

export type DeductionDescription = {
  /** YYYY-MM-DD when the detail carries one, else "" */
  date: string;
  /** Thai category label */
  category: string;
  /** short Thai description of what was docked */
  item: string;
  /** DeductionRecord.points — positive = points removed, negative = points credited back */
  points: number;
  /** the raw detail/evidence string */
  note: string;
};

/** Turn one DeductionRecord into the Thai, human-readable shape both CSV files share. */
export function describeDeduction(deduction: DeductionRecord): DeductionDescription {
  const date = extractDate(deduction.detail);
  const category = CATEGORY_TH[deduction.category];
  let item: string;
  switch (deduction.reason) {
    case "late_within_10_minutes":
    case "late_over_10_minutes": {
      const minutes = deduction.detail.match(/late (\d+) minutes?/);
      item = minutes ? `สาย ${minutes[1]} นาที` : "มาสาย";
      break;
    }
    case "late_over_30_minutes_or_missing_clock_in":
      item = "ไม่ลงเวลาเข้างาน / สายเกิน 30 นาที";
      break;
    case "stock_not_counted":
      item = "ไม่ได้นับสต็อก";
      break;
    case "stock_slow_count":
      item = "นับสต็อกช้าเกินกรอบ 4 ชม.";
      break;
    case "stock_difference":
      item = "สต็อกไม่ตรง (StoreHub Difference)";
      break;
    case "missing_day":
      item = "ขาด checklist ทั้งวัน";
      break;
    case "missing_important":
      item = "ขาด checklist ข้อสำคัญ";
      break;
    case "late_submit":
      item = "ส่ง checklist ช้ากว่ากำหนด";
      break;
    case "backfilled":
      item = "ส่ง checklist ย้อนหลัง";
      break;
    case "false_record":
      item = "ข้อมูล checklist ไม่ตรงจริง";
      break;
    case "manual_credit":
      item = "ปรับคืนคะแนน (เจ้าของ)";
      break;
    case "manual_deduction":
      item = "ปรับหักคะแนนเพิ่ม (เจ้าของ)";
      break;
    default:
      if (deduction.category === "customer_service") item = serviceItemTh(deduction.reason);
      else if (deduction.category === "assigned_work") item = assignedItemTh(deduction.reason);
      else item = deduction.reason;
  }
  if (deduction.count && deduction.count > 1) item += ` (รวม ${deduction.count} ครั้ง)`;
  return { date, category, item, points: deduction.points, note: deduction.detail };
}

export type AttendanceCounts = {
  /** every late / no-clock occurrence that cost attendance points this month */
  totalLate: number;
  late1to10: number;
  lateOver10: number;
  noClockIn: number;
};

/**
 * Late counts come from the very deductions that lowered the attendance category, so they
 * line up with the score (and approved leave, which is never deducted, is never counted).
 * "ไม่ลงเวลาเข้างาน" is the engine's combined late-over-30-min-or-missing bucket.
 */
export function attendanceCounts(row: EmployeePerformanceScore): AttendanceCounts {
  const attendance = row.deductions.filter((deduction) => deduction.category === "attendance");
  const late1to10 = attendance.filter((deduction) => deduction.reason === "late_within_10_minutes").length;
  const lateOver10 = attendance.filter((deduction) => deduction.reason === "late_over_10_minutes").length;
  const noClockIn = attendance.filter((deduction) => deduction.reason === "late_over_30_minutes_or_missing_clock_in").length;
  return { totalLate: late1to10 + lateOver10 + noClockIn, late1to10, lateOver10, noClockIn };
}

function formatImpact(points: number): string {
  const impact = -points;
  return impact >= 0 ? `+${impact}` : `${impact}`;
}

/** The column 20 cell: every deduction summarised, joined by " ; ". */
export function deductionSummaryCell(row: EmployeePerformanceScore): string {
  return row.deductions
    .map((deduction) => {
      const described = describeDeduction(deduction);
      const datePrefix = described.date ? `${described.date} ` : "";
      return `${datePrefix}${described.item} ${formatImpact(deduction.points)}`;
    })
    .join(" ; ");
}

const BOM = "﻿";

function csvCell(value: string | number): string {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(rows: Array<Array<string | number>>): string {
  return BOM + rows.map((columns) => columns.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const SUMMARY_HEADERS = [
  "เดือน",
  "รหัสพนักงาน",
  "ชื่อ",
  "สาขา",
  "ประเภท",
  "การเข้างาน",
  "สต็อก",
  "Checklist",
  "บริการลูกค้า",
  "งานที่มอบหมาย",
  "คะแนนรวม",
  "อินเซนทีฟ (%)",
  "จำนวนจุดที่ต่ำกว่า 50",
  "หักเงินเดือน (บาท)",
  "วันทำงาน",
  "จำนวนครั้งที่มาสายทั้งหมด",
  "สาย 1–10 นาที (ครั้ง)",
  "สายเกิน 10 นาที (ครั้ง)",
  "ไม่ลงเวลาเข้างาน (ครั้ง)",
  "รายการที่ถูกหักคะแนน"
];

const DETAIL_HEADERS = [
  "เดือน",
  "รหัสพนักงาน",
  "ชื่อ",
  "สาขา",
  "วันที่",
  "หมวด",
  "รายการ",
  "คะแนนที่หัก",
  "หมายเหตุหรือหลักฐาน"
];

export type CsvBuildContext = {
  /** the month the export is for, "YYYY-MM" */
  month: string;
  /** scheduled work days in the month per staff code (วันทำงาน column) */
  daysWorkedByCode: Record<string, number>;
};

/** One row per employee for the selected month. */
export function buildSummaryCsv(rows: EmployeePerformanceScore[], context: CsvBuildContext): string {
  const body = rows.map((row) => {
    const counts = attendanceCounts(row);
    return [
      context.month,
      row.employeeName,
      displayNameFor(row.employeeName),
      branchShortName(branchFor(row.employeeName)),
      employmentTypeFor(row.employeeName),
      row.categories.attendance.score,
      row.categories.stock.score,
      row.categories.checklist.score,
      row.categories.customerService.score,
      row.categories.assignedWork.score,
      row.totalScore,
      row.incentive.percent,
      row.salaryDeduction.pointsShort,
      row.salaryDeduction.amount,
      context.daysWorkedByCode[row.employeeName] ?? 0,
      counts.totalLate,
      counts.late1to10,
      counts.lateOver10,
      counts.noClockIn,
      deductionSummaryCell(row)
    ];
  });
  return toCsv([SUMMARY_HEADERS, ...body]);
}

/**
 * One row per deduction. The sum of "คะแนนที่หัก" for a person equals the points they lost
 * in the summary (100 − คะแนนรวม before the 0–100 clamp), because both read the same
 * row.deductions list. Owner credits appear as a negative "คะแนนที่หัก" so the totals tie out.
 */
export function buildDetailCsv(rows: EmployeePerformanceScore[], context: CsvBuildContext): string {
  const body: Array<Array<string | number>> = [];
  rows.forEach((row) => {
    row.deductions.forEach((deduction) => {
      const described = describeDeduction(deduction);
      body.push([
        context.month,
        row.employeeName,
        displayNameFor(row.employeeName),
        branchShortName(branchFor(row.employeeName)),
        described.date,
        described.category,
        described.item,
        deduction.points,
        described.note
      ]);
    });
  });
  return toCsv([DETAIL_HEADERS, ...body]);
}
