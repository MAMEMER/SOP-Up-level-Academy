import { redirect } from "next/navigation";
import Link from "next/link";
import { DailyChecklistEditor } from "../../../../../components/DailyChecklistEditor.tsx";
import { cardStoreWorkflow } from "../../../../../lib/card-store-workflow.ts";
import { resolveAdminBranch } from "../../../../../lib/admin-branch.ts";
import { AdminBranchSwitch } from "../../../../../components/AdminBranchSwitch.tsx";
import { requireUser } from "../../../../../lib/auth.ts";

export default async function AdminChecklistDailyPage({ searchParams }: { searchParams?: Promise<{ branch?: string }> }) {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const branch = await resolveAdminBranch((searchParams ? await searchParams : {}).branch);

  return (
    <main className="page">
      <Link href="/admin/checklist-config" className="back-link">← กลับ ปรับ Checklist</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Checklist config · Daily</p>
          <h2>ปรับ Checklist ประจำวัน</h2>
          <p>แก้รายการ checklist แต่ละช่วง (เปิดร้าน / stock / จัดส่ง / ปิดร้าน) — staff เห็นทันทีที่เปิดหน้า checklist</p>
        </div>
      </section>
      <div className="admin-branch-bar">
        <AdminBranchSwitch value={branch} />
        <small>ข้อมูลในหน้านี้เป็นของสาขาที่เลือก</small>
      </div>
      <DailyChecklistEditor key={branch} phases={cardStoreWorkflow} branch={branch} editedBy={user.email ?? user.name} />
    </main>
  );
}
