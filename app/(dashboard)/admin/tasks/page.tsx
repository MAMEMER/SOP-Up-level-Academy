import { redirect } from "next/navigation";
import Link from "next/link";
import { StoreTaskManager } from "../../../../components/StoreTaskManager.tsx";
import { TaskProgressBoard } from "../../../../components/TaskProgressBoard.tsx";
import { requireUser } from "../../../../lib/auth.ts";
import { resolveAdminBranch } from "../../../../lib/admin-branch.ts";
import { AdminBranchSwitch } from "../../../../components/AdminBranchSwitch.tsx";
import { formatWorkDate } from "../../../../lib/workflow-records.ts";

export const dynamic = "force-dynamic";

export default async function AdminTasksPage({ searchParams }: { searchParams?: Promise<{ branch?: string }> }) {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const branch = await resolveAdminBranch((searchParams ? await searchParams : {}).branch);

  return (
    <main className="page">
      <Link href="/admin" className="back-link">← กลับ หน้ารวมงานจัดการ</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Tasks</p>
          <h2>สั่งงานประจำ</h2>
          <p>
            รายวัน / รายสัปดาห์ / รายเดือน อยู่ที่เดียวกัน ต่างกันแค่สั่งบ่อยแค่ไหนและลงวันไหน —
            ทุกงานตั้งได้เหมือนกัน: กะไหน · เริ่มทำได้ตั้งแต่ · ต้องจบไม่เกิน · ส่งงานแบบไหน · รายละเอียด
          </p>
        </div>
      </section>
      <div className="admin-branch-bar">
        <AdminBranchSwitch value={branch} />
        <small>ข้อมูลในหน้านี้เป็นของสาขาที่เลือก</small>
      </div>
      {/* วันนี้ใครทำถึงไหน — ดูก่อนแก้ลิสต์งาน จะได้รู้ว่างานไหนค้างจริง */}
      <section className="workflow-panel">
        <p className="task-group__title">วันนี้ทำถึงไหน</p>
        <TaskProgressBoard key={`p-${branch}`} branch={branch} date={formatWorkDate()} />
      </section>
      <StoreTaskManager key={branch} branch={branch} />
    </main>
  );
}
