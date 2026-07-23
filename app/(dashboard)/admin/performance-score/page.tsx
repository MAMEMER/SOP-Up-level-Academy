import { PerformanceScoreView } from "../../../../components/PerformanceScoreView.tsx";
import { requireUser } from "../../../../lib/auth.ts";
import { isOwner } from "../../../../lib/owner.ts";

type PageProps = {
  searchParams?: Promise<{ period?: string; startDate?: string; endDate?: string; source?: string }>;
};

export default async function PerformanceScorePage({ searchParams }: PageProps) {
  const user = await requireUser();
  // salary-deduction figures are owner-only (Champ + Nem), hidden from other admins
  return <PerformanceScoreView searchParams={searchParams} basePath="/admin/performance-score" showAdminBackLink isOwner={isOwner(user.email)} />;
}
