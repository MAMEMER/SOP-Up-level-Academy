import { PerformanceScoreView } from "../../../../components/PerformanceScoreView.tsx";

type PageProps = {
  searchParams?: Promise<{ period?: string; startDate?: string; endDate?: string; source?: string }>;
};

export default async function PerformanceScorePage({ searchParams }: PageProps) {
  return <PerformanceScoreView searchParams={searchParams} basePath="/admin/performance-score" showAdminBackLink />;
}
