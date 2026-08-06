import { redirect } from "next/navigation";
import { PerformanceScoreView } from "../../components/PerformanceScoreView.tsx";
import { requireUser } from "../../lib/auth.ts";
import { isOwner } from "../../lib/owner.ts";

type PageProps = {
  searchParams?: Promise<{ period?: string; startDate?: string; endDate?: string; source?: string }>;
};

// SECURITY: this public URL used to render the WHOLE team's KPI board (names + scores)
// with no auth at all — `curl /performance-score` returned 200 with everyone's data.
// Gate it exactly like /admin/performance-score: sign-in required; an admin sees the full
// board, a normal staff member is sent to their own dashboard (they must not read peers'
// scores). Salary-deduction figures stay owner-only via the same isOwner gate.
export default async function PublicPerformanceScorePage({ searchParams }: PageProps) {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/my-view");
  return <PerformanceScoreView searchParams={searchParams} basePath="/performance-score" isOwner={isOwner(user.email)} />;
}
