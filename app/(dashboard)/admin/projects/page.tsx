import { redirect } from "next/navigation";
import Link from "next/link";
import { ProjectBoard } from "../../../../components/ProjectBoard.tsx";
import { requireUser } from "../../../../lib/auth.ts";
import { employeeDirectory } from "../../../../lib/employee-directory.ts";
import { resolveProjectMonth } from "../../../../lib/project-month.ts";
import { buildTeamOptions } from "../../../../lib/team-options.ts";
import { formatWorkDate } from "../../../../lib/workflow-records.ts";

// ตัวเลข % / วันที่เหลือ ต้องสดเสมอ — เจ้าของใช้ตัดสินใจว่าจะยืดเวลาให้หรือเพิ่มคนช่วย
export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<{ month?: string }> };

export default async function AdminProjectsPage({ searchParams }: PageProps) {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const staff = employeeDirectory
    .filter((entry) => entry.branch === "bangkae")
    .map((entry) => ({ code: entry.code, displayName: entry.displayName, employmentType: entry.employmentType }));
  const teams = buildTeamOptions(employeeDirectory);

  // เดือนที่จะเปิดดู — ค่าเริ่มต้นคือเดือนก่อนหน้า, ค่าบน URL ที่เพี้ยนหรือเป็นอนาคตถูกตีกลับ
  const today = formatWorkDate();
  const month = resolveProjectMonth((await searchParams)?.month, today);

  return (
    <main className="page">
      <Link href="/admin" className="back-link">← กลับ หน้ารวมงานจัดการ</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Projects</p>
          <h2>งานที่มอบหมาย</h2>
          <p>
            งานเดี่ยวหรืองานกลุ่ม สั่งวันเดียวหรือหลายวันก็ได้ — ใช้ฟิลด์ชุดเดียวกับงานประจำ (ใครทำ · เวลา · ส่งงานแบบไหน · รายละเอียด) งานหลายวันส่งเป็น progress รายวัน
          </p>
        </div>
      </section>
      <ProjectBoard branch="bangkae" staff={staff} teams={teams} today={today} month={month} />
    </main>
  );
}
