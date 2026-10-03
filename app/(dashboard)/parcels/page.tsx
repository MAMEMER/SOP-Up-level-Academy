import { ParcelOrdersBoard } from "../../../components/ParcelOrdersBoard.tsx";
import { requireUser } from "../../../lib/auth.ts";
import { resolveEmployeeByEmail } from "../../../lib/employee-directory.ts";
import { workBranchFor } from "../../../lib/delivery-tasks-server.ts";
import { formatWorkDate } from "../../../lib/workflow-records.ts";

// พัสดุการ์ด: เจ้าของร้านลงออเดอร์การ์ดที่สั่งจากพ่อค้า → แอดมินหน้าร้านรับพัสดุ (วิดีโอแกะกล่อง)
// → เช็คทีละรายการ → ลงตามที่บอก. เจ้าของร้านเห็นทุกสาขา · พนักงานเห็นสาขาที่เข้ากะวันนี้.
export const dynamic = "force-dynamic";

export default async function ParcelsPage() {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  const branch = isAdmin ? undefined : await workBranchFor(resolveEmployeeByEmail(user.email), formatWorkDate());

  return (
    <main className="page">
      <ParcelOrdersBoard branch={branch} isAdmin={isAdmin && !user.isImpersonating} canAct={!user.isImpersonating} />
    </main>
  );
}
