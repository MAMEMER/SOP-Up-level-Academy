import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type PerformanceSourceFiles = {
  attendanceCsvPath: string;
  stockCsvPath: string;
};

export const monthlyPerformanceSourceFolder = "/Users/home/Desktop/codex/Documents/Man power/ข้อมูล performance รายเดือน ";

const fallbackPerformanceSourceFiles: PerformanceSourceFiles = {
  attendanceCsvPath: "/Users/home/Downloads/Timesheets_06-10-2026_07-09-2026.csv",
  stockCsvPath: "/Users/home/Downloads/Stock_Take_07-09-2026 (1).csv"
};

const storePath = join(process.cwd(), ".data", "performance-source-files.json");

function latestCsvPath(folderPath: string, fileNamePattern: RegExp) {
  if (!existsSync(folderPath)) return undefined;
  const matches = readdirSync(folderPath)
    .filter((fileName) => fileNamePattern.test(fileName))
    .map((fileName) => {
      const filePath = join(folderPath, fileName);
      return { filePath, mtimeMs: statSync(filePath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs || b.filePath.localeCompare(a.filePath));

  return matches[0]?.filePath;
}

export function resolveMonthlyPerformanceSourceFiles(folderPath = monthlyPerformanceSourceFolder): PerformanceSourceFiles {
  return {
    attendanceCsvPath: latestCsvPath(folderPath, /^Timesheets_.*\.csv$/i) || fallbackPerformanceSourceFiles.attendanceCsvPath,
    stockCsvPath: latestCsvPath(folderPath, /^Stock_Take_.*\.csv$/i) || fallbackPerformanceSourceFiles.stockCsvPath
  };
}

export const defaultPerformanceSourceFiles: PerformanceSourceFiles = resolveMonthlyPerformanceSourceFiles();

// Portable in-repo location for CSVs uploaded through the performance page, so the
// KPI engine no longer depends on a machine-local Desktop folder.
const uploadDir = join(process.cwd(), ".data", "uploads");

export function readPerformanceSourceFiles(): PerformanceSourceFiles {
  const monthlyFiles = resolveMonthlyPerformanceSourceFiles();
  if (!existsSync(storePath)) return monthlyFiles;
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    const savedAttendancePath = typeof parsed.attendanceCsvPath === "string" ? parsed.attendanceCsvPath.trim() : "";
    const savedStockPath = typeof parsed.stockCsvPath === "string" ? parsed.stockCsvPath.trim() : "";
    // A saved/uploaded file that actually exists on disk wins over the monthly folder,
    // so an upload in the UI is authoritative and works on any machine.
    return {
      attendanceCsvPath: savedAttendancePath && existsSync(savedAttendancePath) ? savedAttendancePath : monthlyFiles.attendanceCsvPath,
      stockCsvPath: savedStockPath && existsSync(savedStockPath) ? savedStockPath : monthlyFiles.stockCsvPath
    };
  } catch {
    return monthlyFiles;
  }
}

/** Persists an uploaded CSV into the repo's .data/uploads and points the source at it. */
export function saveUploadedPerformanceCsv(sourceKey: string, content: string): PerformanceSourceFiles {
  const fileName = sourceKey === "stock" ? "stock-latest.csv" : "attendance-latest.csv";
  mkdirSync(uploadDir, { recursive: true });
  const filePath = join(uploadDir, fileName);
  writeFileSync(filePath, content, "utf8");
  return savePerformanceSourceFilePath(sourceKey, filePath);
}

export function writePerformanceSourceFiles(files: PerformanceSourceFiles) {
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify(files, null, 2)}\n`, "utf8");
}

export function savePerformanceSourceFilePath(sourceKey: string, sourcePath: string) {
  const current = readPerformanceSourceFiles();
  const next = {
    ...current,
    ...(sourceKey === "attendance" ? { attendanceCsvPath: sourcePath.trim() } : {}),
    ...(sourceKey === "stock" ? { stockCsvPath: sourcePath.trim() } : {})
  };
  writePerformanceSourceFiles(next);
  return next;
}
