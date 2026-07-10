import Link from "next/link";
import { DashboardChecklistStatus } from "../../components/DashboardChecklistStatus.tsx";
import { DashboardTaskSections } from "../../components/DashboardTaskSections.tsx";
import { cardStoreWorkflow } from "../../lib/card-store-workflow.ts";
import { requireUser } from "../../lib/auth.ts";

export default async function HomePage() {
  const user = await requireUser();

  return (
    <main className="page">
      <section className="board-hero">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h2>ภาพรวมงานประจำวัน</h2>
          <p>ติดตาม checklist, งาน stock, review และ performance สำหรับทีม Uplevel</p>
        </div>
        <div className="hero-actions">
          <Link href="/checklist" className="primary-action">เปิด Checklist</Link>
          {user.role === "admin" ? <Link href="/admin/performance-score">Performance Score</Link> : null}
        </div>
      </section>

      <DashboardChecklistStatus phases={cardStoreWorkflow} />
      <DashboardTaskSections phases={cardStoreWorkflow} />
    </main>
  );
}
