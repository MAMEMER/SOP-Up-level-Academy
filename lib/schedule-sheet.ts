// Live schedule reader for a CLEAN normalized Google-Sheet tab.
//
// The legacy month-grid tab (JUN26/JUL26) cannot be parsed reliably: the day-number
// header has typos (day 10 labelled "11" shifts every following column), shift codes
// are ambiguous (11/13 documented, 15/23 not), and gviz can't resolve the dotted tab
// names. So instead of reverse-engineering that grid live, the app reads a clean tab
// with one row per shift and unambiguous, dropdown-guarded columns:
//
//   วันที่ (YYYY-MM-DD) | รหัสพนักงาน | เข้ากะ (HH:MM or OFF) | สถานะ (ทำงาน/ลาป่วย/ลากิจ)
//
// Populate that tab once (see docs/schedule-clean-tab.md) and set SCHEDULE_SHEET_CSV_URL;
// until then the app falls back to its built-in fixtures.

import type { LeaveRecord, LeaveType, ShiftSchedule } from "./performance-score.ts";
import { resolveEmployeeCode } from "./employee-directory.ts";

export type ScheduleSheetResult = {
  schedules: ShiftSchedule[];
  leaves: LeaveRecord[];
};

/** gviz CSV export URL for a given sheet id + tab (public-readable sheets only). */
export function scheduleSheetCsvUrl(sheetId: string, tabName: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function normalizeTime(value: string): string | undefined {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function leaveTypeFromStatus(value: string): LeaveType | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("ลาป่วย") || normalized === "sick") return "sick";
  if (normalized.includes("ลากิจ") || normalized === "personal") return "personal";
  return undefined;
}

/**
 * Parses a clean schedule CSV (header row + one row per shift) into schedules + leaves.
 * Header names are matched loosely so column order can vary.
 */
export function parseScheduleSheetCsv(csvText: string): ScheduleSheetResult {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return { schedules: [], leaves: [] };

  const header = splitCsvLine(lines[0]).map((cell) => cell.toLowerCase());
  const findCol = (...needles: string[]) =>
    header.findIndex((cell) => needles.some((needle) => cell.includes(needle)));
  const dateCol = findCol("วันที่", "date");
  const empCol = findCol("พนักงาน", "รหัส", "employee", "name");
  const shiftCol = findCol("เข้ากะ", "กะ", "shift", "time");
  const statusCol = findCol("สถานะ", "status");
  if (dateCol < 0 || empCol < 0 || shiftCol < 0) return { schedules: [], leaves: [] };

  const schedules: ShiftSchedule[] = [];
  const leaves: LeaveRecord[] = [];

  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const workDate = (cells[dateCol] || "").trim();
    const employeeName = resolveEmployeeCode(cells[empCol] || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate) || !employeeName) continue;

    const status = statusCol >= 0 ? cells[statusCol] || "" : "";
    const leaveType = leaveTypeFromStatus(status);
    if (leaveType) {
      leaves.push({ employeeName, workDate, type: leaveType, source: "google-sheet" });
      continue;
    }

    const shiftRaw = (cells[shiftCol] || "").trim();
    if (!shiftRaw || shiftRaw.toUpperCase() === "OFF") continue;
    const start = normalizeTime(shiftRaw);
    if (!start) continue;

    const scheduledStart = `${workDate}T${start}:00+07:00`;
    const scheduledEnd = new Date(Date.parse(scheduledStart) + 9 * 60 * 60 * 1000).toISOString();
    schedules.push({
      employeeName,
      workDate,
      scheduledStart,
      scheduledEnd,
      shiftLabel: `sheet ${start}`,
      source: "google-sheet"
    });
  }

  return { schedules, leaves };
}

/** Fetches + parses the clean schedule tab. Returns empty result on any failure. */
export async function fetchScheduleFromSheet(csvUrl: string): Promise<ScheduleSheetResult> {
  try {
    const response = await fetch(csvUrl, { cache: "no-store" });
    if (!response.ok) return { schedules: [], leaves: [] };
    return parseScheduleSheetCsv(await response.text());
  } catch {
    return { schedules: [], leaves: [] };
  }
}
