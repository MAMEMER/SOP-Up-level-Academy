import Link from "next/link";
import { MyProjects } from "../../../components/MyProjects.tsx";
import { requireUser } from "../../../lib/auth.ts";
import { branchFor, employeeCodeForEmail } from "../../../lib/employee-directory.ts";
import { formatWorkDate } from "../../../lib/workflow-records.ts";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await requireUser();
  const staffCode = employeeCodeForEmail(user.email) || null;
  const branch = staffCode ? branchFor(staffCode) : "bangkae";

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Projects</p>
          <h2>งานที่มอบหมายให้ฉัน</h2>
          <p>งานเดี่ยว/กลุ่ม ที่เจ้าของสั่งไว้ — งานวันเดียวส่งครั้งเดียวจบ · งานหลายวันส่ง progress อย่างน้อยวันละครั้ง</p>
        </div>
      </section>
      <MyProjects branch={branch} staffCode={staffCode} today={formatWorkDate()} readOnly={user.isImpersonating} isAdmin={user.role === "admin" && !user.isImpersonating} />
    </main>
  );
}
