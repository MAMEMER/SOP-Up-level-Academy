import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TaskFile } from "../../../../../components/TaskFile.tsx";
import { requireUser } from "../../../../../lib/auth.ts";
import { employeeDirectory } from "../../../../../lib/employee-directory.ts";
import { isMonthKey } from "../../../../../lib/project-month.ts";
import { branchColor, branchShortName } from "../../../../../lib/store-config.ts";
import { formatWorkDate } from "../../../../../lib/workflow-records.ts";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ code: string }>; searchParams?: Promise<{ month?: string }> };

// แฟ้มงานของพนักงาน 1 คน (มุมเจ้าของ) — แยกเดือน กดงานแล้วตรวจ/ให้คะแนนได้เลย
export default async function StaffTaskFilePage({ params, searchParams }: PageProps) {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  const code = decodeURIComponent((await params).code);
  const person = employeeDirectory.find((entry) => entry.code === code);
  if (!person) notFound();
  const month = (await searchParams)?.month;

  return (
    <main className="page ti-page" style={{ ["--branch" as string]: branchColor(person.branch) }}>
      <Link href="/admin/task-review" className="back-link">← กลับ หน้าตรวจงาน</Link>
      <header className="ti-hero ti-hero--branch">
        <div>
          <p className="ti-hero__branch">สาขา{branchShortName(person.branch)}</p>
          <h2>แฟ้มงานของ {person.displayName}</h2>
        </div>
      </header>
      <TaskFile codes={[person.code]} today={formatWorkDate()} initialMonth={isMonthKey(month) ? month : undefined} isAdmin />
    </main>
  );
}
