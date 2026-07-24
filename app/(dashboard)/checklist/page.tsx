import Link from "next/link";
import { ChecklistView } from "../../../components/ChecklistView.tsx";
import { cardStoreWorkflow } from "../../../lib/card-store-workflow.ts";
import { requireUser } from "../../../lib/auth.ts";
import { branchFor, resolveEmployeeByEmail } from "../../../lib/employee-directory.ts";
import { formatWorkDate } from "../../../lib/workflow-records.ts";

export default async function ChecklistPage() {
  const user = await requireUser();
  const staffCode = resolveEmployeeByEmail(user.email) ?? null;
  const branch = staffCode ? branchFor(staffCode) : "bangkae";
  const workDate = formatWorkDate();

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Interactive checklist</p>
          <h2>Checklist งานประจำวัน</h2>
          <p>Daily = routine ตามกะที่เข้า · Weekly / Monthly = งานที่ทั้งทีมช่วยกันทำให้ครบในรอบ</p>
        </div>
      </section>
      <ChecklistView
        phases={cardStoreWorkflow}
        userEmail={user.email}
        userRole={user.role}
        staffCode={staffCode}
        branch={branch}
        workDate={workDate}
      />
    </main>
  );
}
