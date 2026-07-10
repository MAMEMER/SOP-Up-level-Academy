export type PerformanceColor = "green" | "orange" | "red" | "purple" | "neutral";

export type PerformanceInput = {
  assigned: boolean;
  loggedIn: boolean;
  startedAt: string | null;
  completedAt: string | null;
  dueSeconds: number;
  completedChecklist: number;
  totalChecklist: number;
};

export function isChecklistComplete(completedChecklist: number, totalChecklist: number) {
  return totalChecklist > 0 && completedChecklist >= totalChecklist;
}

export function elapsedSeconds(startedAt: string, completedAt: string) {
  return Math.max(0, Math.round((Date.parse(completedAt) - Date.parse(startedAt)) / 1000));
}

export function performanceStatus(input: PerformanceInput): PerformanceColor {
  if (!input.assigned) return "neutral";
  if (input.loggedIn && !input.startedAt) return "red";
  if (!input.startedAt || !input.completedAt) return "neutral";
  if (!isChecklistComplete(input.completedChecklist, input.totalChecklist)) return "neutral";

  return elapsedSeconds(input.startedAt, input.completedAt) <= input.dueSeconds ? "green" : "orange";
}

export function qualifiesForPurpleStreak(recentWorkdaysOnTime: boolean[]) {
  return recentWorkdaysOnTime.length > 3 && recentWorkdaysOnTime.every(Boolean);
}
