import type { StockCountRecord } from "./performance-score.ts";
import { resolveEmployeeCode } from "./employee-directory.ts";

export type StoreHubStockTakeExportRow = {
  startTime: string;
  completedTime: string;
  description: string;
  store: string;
  supplier: string;
  productName: string;
  expectedQuantity: number;
  countedQuantity: number;
  difference: number;
  status: string;
  startedBy: string;
  completedBy: string;
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

function parseStoreHubDate(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/);
  if (!match) return "";
  const [, month, day, year, hour, minute] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:00+07:00`;
}

function datePart(isoDateTime: string) {
  return isoDateTime.slice(0, 10);
}

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Delegates to the canonical employee directory so StoreHub name matching is driven
// by one editable alias table instead of scattered substring checks.
export function normalizeStoreHubEmployeeName(name: string) {
  return resolveEmployeeCode(name);
}

export function parseStoreHubStockTakeCsv(csvText: string): StoreHubStockTakeExportRow[] {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim());
  const [headerLine, ...rows] = lines;
  const headers = parseCsvLine(headerLine || "");
  const indexOf = (name: string, fallback: number) => {
    const index = headers.indexOf(name);
    return index >= 0 ? index : fallback;
  };
  return rows.map((line) => {
    const cells = parseCsvLine(line);
    const detailedFormat = headers.includes("Product Name") || headers.includes("Expected Qty") || headers.includes("Difference");
    return {
      startTime: cells[indexOf("Start Time", 0)] || "",
      completedTime: cells[indexOf("Completed Time", 1)] || "",
      description: cells[indexOf("Description", 2)] || "",
      store: cells[indexOf("Store", 3)] || "",
      supplier: cells[indexOf("Supplier", 4)] || "",
      productName: detailedFormat ? cells[indexOf("Product Name", 5)] || "" : "",
      expectedQuantity: detailedFormat ? numberValue(cells[indexOf("Expected Qty", 10)] || "") : 0,
      countedQuantity: detailedFormat ? numberValue(cells[indexOf("Counted Qty", 11)] || "") : 0,
      difference: detailedFormat ? numberValue(cells[indexOf("Difference", 12)] || "") : 0,
      status: cells[indexOf("Status", detailedFormat ? 14 : 5)] || "",
      startedBy: cells[indexOf("Started By", detailedFormat ? 15 : 6)] || "",
      completedBy: cells[indexOf("Completed By", detailedFormat ? 16 : 7)] || ""
    };
  });
}

export function mapStoreHubStockTakeRowsToCounts(rows: StoreHubStockTakeExportRow[]): StockCountRecord[] {
  const grouped = new Map<string, StoreHubStockTakeExportRow[]>();
  rows
    .filter((row) => row.status === "Completed" || row.status === "In Progress")
    .forEach((row) => {
      const key = [row.startTime, row.completedTime, row.supplier, row.status, row.startedBy, row.completedBy].join("|");
      grouped.set(key, [...(grouped.get(key) || []), row]);
    });

  return [...grouped.values()]
    .map((group) => {
      const row = group[0];
      const startedAt = parseStoreHubDate(row.startTime);
      const completedAt = parseStoreHubDate(row.completedTime);
      const employeeName = normalizeStoreHubEmployeeName(row.startedBy || row.completedBy);
      const detailRows = group.filter((item) => item.productName || item.expectedQuantity || item.countedQuantity || item.difference);
      const expectedQuantity = detailRows.reduce((sum, item) => sum + item.expectedQuantity, 0);
      const actualQuantity = detailRows.reduce((sum, item) => sum + item.countedQuantity, 0);
      const hasDifference = detailRows.some((item) => item.difference !== 0);
      return {
        employeeName,
        owner: employeeName,
        category: row.supplier || "StoreHub Stock Take",
        countType: "weekly",
        dueDate: datePart(startedAt),
        startedAt,
        submittedAt: row.status === "Completed" ? completedAt : undefined,
        expectedQuantity,
        actualQuantity,
        discrepancyStatus: hasDifference ? "real_loss" as const : "matched" as const,
        source: "storehub"
      };
    });
}
