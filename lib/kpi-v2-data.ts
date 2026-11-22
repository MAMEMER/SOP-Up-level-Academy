import "server-only";
import { listStaff } from "./staff-store.ts";
import { fetchMistakes, fetchPeerReviews } from "./kpi-v2-store.ts";
import { calculateKpiV2 } from "./kpi-v2-score.ts";

export async function monthlyKpiV2(period: string) {
  const [staff, mistakes, reviews] = await Promise.all([listStaff(), fetchMistakes(), fetchPeerReviews(period)]);
  const roster = staff.filter(p => p.active && p.onRoster && p.code);
  return calculateKpiV2(period, roster.map(p => ({ code: p.code, branch: p.branch, position: p.position })), mistakes, reviews)
    .map(row => ({ ...row, name: roster.find(p => p.code === row.person.code)?.name || row.person.code }));
}
