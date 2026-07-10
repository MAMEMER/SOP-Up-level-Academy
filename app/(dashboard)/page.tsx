import Link from "next/link";
import { DashboardChecklistStatus } from "../../components/DashboardChecklistStatus.tsx";
import { DashboardTaskSections } from "../../components/DashboardTaskSections.tsx";
import { cardStoreWorkflow } from "../../lib/card-store-workflow.ts";
import { requireUser } from "../../lib/auth.ts";

const productArrangementCards = [
  {
    title: "น้ำ / ขนม",
    description: "จัดเรียงน้ำและขนมให้เห็นจำนวนชัด เติมช่องว่าง และถ่ายรูปก่อนเริ่มนับ Stock",
    image: "/training/snack-shelf-opening.jpg",
    alt: "ตัวอย่างการจัดเรียงน้ำและขนมบนชั้นหน้าร้าน"
  },
  {
    title: "ตู้ขายอุปกรณ์",
    description: "จัดตู้ขายอุปกรณ์ให้หยิบง่าย ป้ายตรงหมวด และเห็นสินค้าสำคัญครบก่อนเปิดขาย",
    image: "/training/equipment-cabinet.jpg",
    alt: "ตัวอย่างตู้ขายอุปกรณ์และชั้นสินค้า"
  }
] as const;

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
      <section className="product-arrangement-section">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Product arrangement</p>
            <h3>รูปมาตรฐานการจัดเรียงสินค้า</h3>
          </div>
          <Link href="/training" className="text-link">ดูคู่มือรูปหลักฐาน</Link>
        </div>
        <div className="product-arrangement-grid">
          {productArrangementCards.map((card) => (
            <figure key={card.title} className="product-arrangement-card">
              <img src={card.image} alt={card.alt} />
              <figcaption>
                <strong>{card.title}</strong>
                <span>{card.description}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
      <DashboardTaskSections phases={cardStoreWorkflow} />
    </main>
  );
}
