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

export function readPerformanceSourceFiles(): PerformanceSourceFiles {
  const monthlyFiles = resolveMonthlyPerformanceSourceFiles();
  const monthlyHasAttendance = monthlyFiles.attendanceCsvPath !== fallbackPerformanceSourceFiles.attendanceCsvPath;
  const monthlyHasStock = monthlyFiles.stockCsvPath !== fallbackPerformanceSourceFiles.stockCsvPath;
  if (!existsSync(storePath)) return monthlyFiles;
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    const savedAttendancePath = typeof parsed.attendanceCsvPath === "string" ? parsed.attendanceCsvPath.trim() : "";
    const savedStockPath = typeof parsed.stockCsvPath === "string" ? parsed.stockCsvPath.trim() : "";
    return {
      attendanceCsvPath: monthlyHasAttendance
        ? monthlyFiles.attendanceCsvPath
        : savedAttendancePath || monthlyFiles.attendanceCsvPath,
      stockCsvPath: monthlyHasStock
        ? monthlyFiles.stockCsvPath
        : savedStockPath || monthlyFiles.stockCsvPath
    };
  } catch {
    return monthlyFiles;
  }
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
