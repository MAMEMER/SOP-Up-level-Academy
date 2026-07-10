import type { ClockEvent } from "./performance-score.ts";
import { normalizeStoreHubEmployeeName } from "./storehub-stocktake-export.ts";

type StoreHubTimesheetCsvRow = {
  lastName: string;
  firstName: string;
  email: string;
  timeIn: string;
  timeOut: string;
  totalHours: string;
};

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function parseStoreHubDateTime(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4}) \w+ (\d{2}):(\d{2})$/);
  if (!match) return "";
  const [, month, day, year, hour, minute] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:00+07:00`;
}

function datePart(isoDateTime: string) {
  return isoDateTime.slice(0, 10);
}

export function parseStoreHubTimesheetCsv(csvText: string): ClockEvent[] {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim());
  const [, ...rows] = lines;
  let currentEmployee = "";
  const events: ClockEvent[] = [];

  rows.forEach((line) => {
    const cells = parseCsvLine(line);
    const row: StoreHubTimesheetCsvRow = {
      lastName: cells[0] || "",
      firstName: cells[1] || "",
      email: cells[2] || "",
      timeIn: cells[3] || "",
      timeOut: cells[4] || "",
      totalHours: cells[5] || ""
    };

    if (row.lastName || row.firstName) {
      currentEmployee = normalizeStoreHubEmployeeName(`${row.lastName} ${row.firstName}`);
      return;
    }

    const clockIn = parseStoreHubDateTime(row.timeIn);
    if (!currentEmployee || !clockIn) return;

    events.push({
      employeeName: currentEmployee,
      workDate: datePart(clockIn),
      clockIn,
      clockOut: parseStoreHubDateTime(row.timeOut) || undefined,
      source: "storehub"
    });
  });

  return events;
}

export function firstClockInByEmployeeDate(events: ClockEvent[]) {
  const result = new Map<string, ClockEvent>();
  events.forEach((event) => {
    const key = `${event.employeeName}:${event.workDate}`;
    const existing = result.get(key);
    if (!existing || Date.parse(event.clockIn) < Date.parse(existing.clockIn)) result.set(key, event);
  });
  return [...result.values()];
}
