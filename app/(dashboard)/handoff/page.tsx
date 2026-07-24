import Link from "next/link";
import { HandoffBoard } from "../../../components/HandoffBoard.tsx";
import { requireUser } from "../../../lib/auth.ts";
import { branchFor, employeeDirectory, resolveEmployeeByEmail } from "../../../lib/employee-directory.ts";
import { formatWorkDate } from "../../../lib/workflow-records.ts";

export default async function HandoffPage() {
  const user = await requireUser();
  const staffCode = resolveEmployeeByEmail(user.email) ?? null;
  const branch = staffCode ? branchFor(staffCode) : "bangkae";
  const workDate = formatWorkDate();
  const staffOptions = employeeDirectory
    .filter((entry) => entry.branch === branch)
    .map((entry) => ({ code: entry.code, displayName: entry.displayName }));

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Handoff</p>
          <h2>งานส่งต่อ</h2>
          <p>ส่งต่องานข้ามกะให้เพื่อน เช่น ลูกค้าฝากของไว้ — คนกะถัดไปรับไปทำต่อจนเสร็จ</p>
        </div>
      </section>
      <HandoffBoard staffCode={staffCode} branch={branch} workDate={workDate} staffOptions={staffOptions} />
    </main>
  );
}
