import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TaskFile } from "../../../../../../components/TaskFile.tsx";
import { requireUser } from "../../../../../../lib/auth.ts";
import { employeeDirectory } from "../../../../../../lib/employee-directory.ts";
import { isMonthKey } from "../../../../../../lib/project-month.ts";
import { branchColor, branchConfigs, branchShortName } from "../../../../../../lib/store-config.ts";
import { formatWorkDate } from "../../../../../../lib/workflow-records.ts";
import { fetchStaffCodesForBranchMonth } from "../../../../../../lib/shift-plan-server.ts";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ branch: string }>; searchParams?: Promise<{ month?: string }> };

// แฟ้มงานทั้งทีมของสาขา — งานของทุกคนในทีมรวมกัน แยกเดือน
export default async function TeamTaskFilePage({ params, searchParams }: PageProps) {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  const branch = (await params).branch;
  if (!branchConfigs.some((config) => config.key === branch)) notFound();
  const scheduled = await fetchStaffCodesForBranchMonth(branch, formatWorkDate().slice(0, 7)).catch(() => new Set<string>());
  const codes = employeeDirectory.filter((entry) => entry.branch === branch || scheduled.has(entry.code)).map((entry) => entry.code);
  const month = (await searchParams)?.month;

  return (
    <main className="page ti-page" style={{ ["--branch" as string]: branchColor(branch) }}>
      <Link href="/admin/task-review" className="back-link">← กลับ หน้าตรวจงาน</Link>
      <header className="ti-hero ti-hero--branch">
        <div>
          <p className="ti-hero__branch">สาขา{branchShortName(branch)}</p>
          <h2>แฟ้มงานทีม{branchShortName(branch)}</h2>
        </div>
      </header>
      <TaskFile codes={codes} branch={branch} today={formatWorkDate()} initialMonth={isMonthKey(month) ? month : undefined} isAdmin />
    </main>
  );
}
