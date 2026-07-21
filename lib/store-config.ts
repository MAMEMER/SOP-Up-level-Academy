// Branch operating config — used by the Stock KPI to detect a "slow morning count"
// (นับ stock ช้า): a morning stocktake that starts after the store opens is allowed
// up to `stockCountGraceHours` into the shift; starting later than that = slowCount.

export type BranchConfig = {
  key: string;
  displayName: string;
  /** store open time HH:mm (Asia/Bangkok) on weekdays (Mon–Fri) */
  openTimeWeekday: string;
  /** store open time HH:mm on weekends (Sat–Sun) */
  openTimeWeekend: string;
  /** hours after shift start a morning stock count may still begin without penalty */
  stockCountGraceHours: number;
};

export const branchConfigs: BranchConfig[] = [
  {
    key: "bangkae",
    displayName: "Up Level Academy (บางแค)",
    openTimeWeekday: "11:00", // จ–ศ กะแรก 11:00
    openTimeWeekend: "09:00", // ส–อา กะแรก 09:00
    stockCountGraceHours: 4
  }
];

export function branchConfig(key: string): BranchConfig {
  return branchConfigs.find((branch) => branch.key === key) ?? branchConfigs[0];
}

/** Returns the branch open time HH:mm for a given YYYY-MM-DD (weekend vs weekday). */
export function openTimeFor(branchKey: string, workDate: string): string {
  const config = branchConfig(branchKey);
  // Use local noon so the +07 date never rolls into the previous UTC day.
  const day = new Date(`${workDate}T12:00:00+07:00`).getUTCDay(); // 0=Sun … 6=Sat
  const isWeekend = day === 0 || day === 6;
  return isWeekend ? config.openTimeWeekend : config.openTimeWeekday;
}

/**
 * A morning stock count is "slow" when it was started, but started later than
 * `graceHours` after the scheduled shift start (i.e. it dragged past the allowed
 * morning window). Returns false when there is no start timestamp.
 */
export function isSlowMorningCount(input: {
  scheduledStart: string;
  startedAt?: string;
  graceHours: number;
}): boolean {
  if (!input.startedAt) return false;
  const start = Date.parse(input.scheduledStart);
  const started = Date.parse(input.startedAt);
  if (!Number.isFinite(start) || !Number.isFinite(started)) return false;
  const deadline = start + input.graceHours * 60 * 60 * 1000;
  return started > deadline;
}
