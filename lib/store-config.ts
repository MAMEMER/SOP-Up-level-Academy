// Branch operating config — used by the Stock KPI to detect a "slow morning count"
// (นับ stock ช้า): a morning stocktake that starts after the store opens is allowed
// up to `stockCountGraceHours` into the shift; starting later than that = slowCount.

export type BranchConfig = {
  key: string;
  displayName: string;
  /** local store open time HH:mm (Asia/Bangkok) */
  openTime: string;
  /** hours after shift start a morning stock count may still begin without penalty */
  stockCountGraceHours: number;
};

export const branchConfigs: BranchConfig[] = [
  {
    key: "bangkae",
    displayName: "Up Level Academy (บางแค)",
    openTime: "11:00", // TODO: confirm real บางแค open time with Champ
    stockCountGraceHours: 4
  }
];

export function branchConfig(key: string): BranchConfig {
  return branchConfigs.find((branch) => branch.key === key) ?? branchConfigs[0];
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
