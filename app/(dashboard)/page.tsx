import Link from "next/link";
import { DashboardChecklistStatus } from "../../components/DashboardChecklistStatus.tsx";
import { DashboardTaskSections } from "../../components/DashboardTaskSections.tsx";
import { cardStoreWorkflow } from "../../lib/card-store-workflow.ts";
import { requireUser } from "../../lib/auth.ts";

const dashboardCategories = [
  { href: "/checklist", title: "Checklist", detail: "งานวันนี้" },
  { href: "/training", title: "คู่มือ", detail: "มาตรฐานรูป" },
  { href: "/checklist#stock-work", title: "Stock", detail: "นับและเติม" },
  { href: "/checklist#daytime-work", title: "Shipping", detail: "ออเดอร์จัดส่ง" },
  { href: "/checklist#close-store", title: "Close", detail: "ปิดร้าน" }
] as const;

export default async function HomePage() {
  const user = await requireUser();

  return (
    <main className="page">
      <section className="board-hero apple-store-hero">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h2>SOP_UPLEVEL</h2>
          <p><strong>ศูนย์งานประจำวันของทีมหน้าร้าน</strong> ติดตาม checklist, งาน stock, จัดส่งสินค้า และหลักฐานปิดร้านในที่เดียว</p>
        </div>
        <div className="hero-actions">
          <Link href="/checklist" className="primary-action">เปิด Checklist</Link>
          {user.role === "admin" ? <Link href="/admin/performance-score">Performance Score</Link> : null}
        </div>
      </section>

      <nav className="apple-category-strip" aria-label="Dashboard shortcuts">
        {dashboardCategories.map((item) => (
          <Link key={item.href} href={item.href}>
            <span>{item.title}</span>
            <small>{item.detail}</small>
          </Link>
        ))}
      </nav>

      <DashboardChecklistStatus phases={cardStoreWorkflow} />
      <DashboardTaskSections phases={cardStoreWorkflow} />
    </main>
  );
}
