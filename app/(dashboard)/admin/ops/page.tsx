import Link from "next/link";
import { redirect } from "next/navigation";
import { OwnerOpsBoard } from "../../../../components/OwnerOpsBoard.tsx";
import { requireUser } from "../../../../lib/auth.ts";
import { isOwner } from "../../../../lib/owner.ts";
import { getOpsSummary } from "../../../../lib/ops-summary.ts";
import { formatWorkDate } from "../../../../lib/workflow-records.ts";

type PageProps = {
  searchParams?: Promise<{ date?: string }>;
};

function isDateValue(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export default async function AdminOpsPage({ searchParams }: PageProps) {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const params = searchParams ? await searchParams : {};
  const workDate = isDateValue(params.date) ? params.date! : formatWorkDate();
  const summary = await getOpsSummary(workDate);

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">OPERATION MONITOR</p>
          <h2>สรุปเจ้าของร้าน</h2>
          <p>ภาพรวมงานหน้าร้านของวันที่เลือก — checklist, งานที่มอบหมาย, งานส่งต่อ, งานสัปดาห์/เดือน และปัญหาบริการ</p>
        </div>
        <form className="owner-ops__date">
          <label>
            วันที่
            <input type="date" name="date" defaultValue={workDate} />
          </label>
          <button type="submit">ดู</button>
        </form>
      </section>

      <OwnerOpsBoard summary={summary} isOwner={isOwner(user.email)} />
    </main>
  );
}
