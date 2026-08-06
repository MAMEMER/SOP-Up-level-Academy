import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "../../../../lib/auth.ts";

// Hub for the checklist editors, split clearly by type. Each type has its own page so the
// owner edits Daily / Weekly / Monthly checklists separately without them blurring together.
export default async function AdminChecklistConfigHubPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const cards: Array<{ href: string; eyebrow: string; title: string; detail: string }> = [
    {
      href: "/admin/checklist-config/daily",
      eyebrow: "Daily",
      title: "Checklist ประจำวัน",
      detail: "งานตามกะ (เปิดร้าน / stock / จัดส่ง / ปิดร้าน) — แก้รายการ เวลาส่ง ลำดับหัวข้อ กะ และหลักฐาน"
    },
    {
      href: "/admin/checklist-config/weekly",
      eyebrow: "Weekly",
      title: "Checklist ประจำสัปดาห์",
      detail: "งาน Stock อุปกรณ์ / Sleeve และ checklist วันจัดกิจกรรมของแต่ละเกม (Pokemon, Lorcana, Rift Bound, Eidolon)"
    },
    {
      href: "/admin/checklist-config/monthly",
      eyebrow: "Monthly",
      title: "Checklist ประจำเดือน",
      detail: "งาน Stock Single card ประจำเดือน — แก้รายการที่พนักงานต้องติ๊ก"
    }
  ];

  return (
    <main className="page">
      <Link href="/admin" className="back-link">← กลับ Admin</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Checklist config</p>
          <h2>ปรับ Checklist</h2>
          <p>เลือกประเภทที่จะแก้ — Daily / Weekly / Monthly แยกกันชัดเจน · staff เห็นทันทีที่เปิดหน้า checklist</p>
        </div>
      </section>

      <div className="admin-hub__tools">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="admin-hub__tool">
            <div>
              <strong>{card.title}</strong>
              <em>{card.eyebrow}</em>
            </div>
            <small>{card.detail}</small>
          </Link>
        ))}
      </div>
    </main>
  );
}
