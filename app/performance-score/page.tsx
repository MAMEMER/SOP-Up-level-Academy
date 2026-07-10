import { PerformanceScoreView } from "../../components/PerformanceScoreView.tsx";

type PageProps = {
  searchParams?: Promise<{ period?: string; startDate?: string; endDate?: string; source?: string }>;
};

export default async function PublicPerformanceScorePage({ searchParams }: PageProps) {
  return <PerformanceScoreView searchParams={searchParams} basePath="/performance-score" />;
}
