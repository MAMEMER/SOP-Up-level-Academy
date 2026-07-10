import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type PerformanceSourceFiles = {
  attendanceCsvPath: string;
  stockCsvPath: string;
};

export const defaultPerformanceSourceFiles: PerformanceSourceFiles = {
  attendanceCsvPath: "/Users/home/Downloads/Timesheets_06-10-2026_07-09-2026.csv",
  stockCsvPath: "/Users/home/Downloads/Stock_Take_07-09-2026 (1).csv"
};

const storePath = join(process.cwd(), ".data", "performance-source-files.json");

export function readPerformanceSourceFiles(): PerformanceSourceFiles {
  if (!existsSync(storePath)) return defaultPerformanceSourceFiles;
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return {
      attendanceCsvPath: typeof parsed.attendanceCsvPath === "string" && parsed.attendanceCsvPath.trim()
        ? parsed.attendanceCsvPath.trim()
        : defaultPerformanceSourceFiles.attendanceCsvPath,
      stockCsvPath: typeof parsed.stockCsvPath === "string" && parsed.stockCsvPath.trim()
        ? parsed.stockCsvPath.trim()
        : defaultPerformanceSourceFiles.stockCsvPath
    };
  } catch {
    return defaultPerformanceSourceFiles;
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
