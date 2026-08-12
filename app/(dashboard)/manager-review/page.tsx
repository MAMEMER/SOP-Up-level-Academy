import Link from "next/link";
import { redirect } from "next/navigation";
import { ManagerReviewBoard } from "../../../components/ManagerReviewBoard.tsx";
import { branchFor, employeeCodeForEmail } from "../../../lib/employee-directory.ts";
import { requireUser } from "../../../lib/auth.ts";

export const dynamic = "force-dynamic";

export default async function ManagerReviewPage() {
  const user = await requireUser();
  // เฉพาะ role admin (เจ้าของร้าน) เท่านั้น — พนักงาน/leader เข้าไม่ได้.
  if (user.role !== "admin") redirect("/");

  const staffCode = employeeCodeForEmail(user.email);
  const branch = staffCode ? branchFor(staffCode) : "bangkae";

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Manager review</p>
          <h2>ตรวจงานที่พนักงานส่ง</h2>
          <p>
            งานที่พนักงานทุกคนส่งตรวจ ทั้งรายวัน รายสัปดาห์ รายเดือน และงานที่มอบหมาย —
            ดูรายละเอียดและหลักฐานของแต่ละงาน แล้วอนุมัติหรือขอให้แก้ไขได้จากที่เดียว
          </p>
        </div>
      </section>

      <ManagerReviewBoard branch={branch} />
    </main>
  );
}
