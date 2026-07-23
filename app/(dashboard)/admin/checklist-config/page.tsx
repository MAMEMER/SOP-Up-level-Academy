import { redirect } from "next/navigation";
import Link from "next/link";
import { DailyChecklistEditor } from "../../../../components/DailyChecklistEditor.tsx";
import { cardStoreWorkflow } from "../../../../lib/card-store-workflow.ts";
import { requireUser } from "../../../../lib/auth.ts";
import { isPreviewMode } from "../../../../lib/preview-data.ts";

export default async function AdminChecklistConfigPage() {
  const user = await requireUser();
  if (user.role !== "admin" && !isPreviewMode()) redirect("/");

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Checklist config</p>
          <h2>ปรับ Checklist ประจำวัน</h2>
          <p>แก้รายการ checklist แต่ละช่วง (เปิดร้าน / stock / จัดส่ง / ปิดร้าน) — staff เห็นทันทีที่เปิดหน้า checklist</p>
        </div>
      </section>
      <DailyChecklistEditor phases={cardStoreWorkflow} branch="bangkae" editedBy={user.email ?? user.name} />
    </main>
  );
}
