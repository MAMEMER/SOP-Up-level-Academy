import { redirect } from "next/navigation";
import Link from "next/link";
import { WorkManualEditor } from "../../../../components/WorkManualEditor.tsx";
import { cardStoreWorkflow } from "../../../../lib/card-store-workflow.ts";
import { requireUser } from "../../../../lib/auth.ts";

export default async function AdminManualConfigPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Manual config</p>
          <h2>แก้คู่มืองาน</h2>
          <p>
            แก้ข้อความในคู่มือที่พนักงานอ่านที่หน้า <Link href="/training">คู่มืองาน</Link> — วัตถุประสงค์
            ขั้นตอน สิ่งที่ต้องระวัง และตัวอย่าง · รายการ checklist กับเวลาส่งงานแก้ที่
            <Link href="/admin/checklist-config"> ปรับ Checklist</Link>
          </p>
        </div>
      </section>
      <WorkManualEditor phases={cardStoreWorkflow} branch="bangkae" editedBy={user.email ?? user.name} />
    </main>
  );
}
