import Link from "next/link";
import { DailyCloseForm } from "../../../components/DailyCloseForm.tsx";
import { requireUser } from "../../../lib/auth.ts";
import { addDays } from "../../../lib/daily-close.ts";
import { getBranchDay } from "../../../lib/daily-close-server.ts";
import { workBranchFor } from "../../../lib/delivery-tasks-server.ts";
import { resolveEmployeeByEmail } from "../../../lib/employee-directory.ts";
import { branchShortName } from "../../../lib/store-config.ts";
import { formatWorkDate } from "../../../lib/workflow-records.ts";

export const dynamic = "force-dynamic";

// ปิดยอดของสาขาที่เข้ากะวันนี้ — ?day=yesterday สำหรับคนที่ปิดเลยเที่ยงคืน
export default async function ClosingPage({ searchParams }: { searchParams?: Promise<{ day?: string }> }) {
  const user = await requireUser();
  const today = formatWorkDate();
  const workDate = (searchParams ? await searchParams : {}).day === "yesterday" ? addDays(today, -1) : today;
  const branch = await workBranchFor(resolveEmployeeByEmail(user.email), workDate);
  const day = await getBranchDay(branch, workDate);

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">ปิดยอด · {branchShortName(branch)}</p>
          <h2>ปิดยอดประจำวัน {workDate}</h2>
          <p>
            ยอดขายดึงจากเครื่อง POS ของสาขานี้เอง · นับเงินสดในลิ้นชักให้ตรง (เงินสดไม่ผ่าน K SHOP) ·
            K SHOP ของสองสาขาเจ้าของร้านเทียบกับยอดธนาคารให้
          </p>
        </div>
        <div className="hero-actions">
          {workDate === today ? (
            <Link href="/closing?day=yesterday" className="soft-button">ปิดของเมื่อวาน</Link>
          ) : (
            <Link href="/closing" className="soft-button">กลับไปวันนี้</Link>
          )}
        </div>
      </section>
      <DailyCloseForm key={`${branch}-${workDate}`} initial={day} branchName={branchShortName(branch)} readOnly={user.isImpersonating} />
    </main>
  );
}
