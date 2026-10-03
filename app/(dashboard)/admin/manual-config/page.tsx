import { redirect } from "next/navigation";
import Link from "next/link";
import { WorkManualEditor } from "../../../../components/WorkManualEditor.tsx";
import { cardStoreWorkflow } from "../../../../lib/card-store-workflow.ts";
import { resolveAdminBranch } from "../../../../lib/admin-branch.ts";
import { AdminBranchSwitch } from "../../../../components/AdminBranchSwitch.tsx";
import { requireUser } from "../../../../lib/auth.ts";

export default async function AdminManualConfigPage({ searchParams }: { searchParams?: Promise<{ branch?: string }> }) {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const branch = await resolveAdminBranch((searchParams ? await searchParams : {}).branch);

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
      <div className="admin-branch-bar">
        <AdminBranchSwitch value={branch} />
        <small>ข้อมูลในหน้านี้เป็นของสาขาที่เลือก</small>
      </div>
      <WorkManualEditor key={branch} phases={cardStoreWorkflow} branch={branch} editedBy={user.email ?? user.name} />
    </main>
  );
}
