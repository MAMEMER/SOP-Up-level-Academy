// KPI v2 staff launch switch. The code ships earlier so a failed deploy is caught
// in time; staff only see the new pages from this moment (Asia/Bangkok).
// Admins see everything immediately so the owner can check before launch.
export const KPI_V2_LAUNCH_AT = Date.parse("2026-11-22T23:00:00+07:00");

export const KPI_V2_PATHS = ["/my-kpi", "/sales-progress", "/work-guide", "/big-deal", "/teach-log"];

export function kpiV2Live(now: number = Date.now()): boolean {
  return now >= KPI_V2_LAUNCH_AT;
}

export function kpiV2Visible(role: string | undefined, now: number = Date.now()): boolean {
  return role === "admin" || kpiV2Live(now);
}

export function isKpiV2Path(href: string): boolean {
  return KPI_V2_PATHS.some((path) => href === path || href.startsWith(`${path}/`) || href.startsWith(`${path}?`));
}
