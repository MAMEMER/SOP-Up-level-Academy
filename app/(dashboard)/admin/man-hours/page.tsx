import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth.ts";
import { isOwner } from "../../../../lib/owner.ts";
import { resolveAdminBranch } from "../../../../lib/admin-branch.ts";
import { AdminBranchSwitch } from "../../../../components/AdminBranchSwitch.tsx";
import { ManHoursBoard } from "../../../../components/ManHoursBoard.tsx";
import { loadManHours, type ManHoursData } from "../../../../lib/man-hours-server.ts";
import { displayNameFor } from "../../../../lib/employee-directory.ts";

// ตัวประเมิน man-hour — งานประจำของน้องๆ ใช้เวลาเท่าไร ทำครบแล้วเหลือว่างไหม หนักไปไหม
// (ไม่นับอีเวนต์พิเศษ). เจ้าของเท่านั้น เพราะเป็นข้อมูลไว้ตัดสินใจเรื่องคน/กะ.

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<{ branch?: string; month?: string }> };

function bangkokMonth(offset = 0): string {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return d.toISOString().slice(0, 7);
}

function addMonths(month: string, offset: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 7);
}

export default async function ManHoursPage({ searchParams }: PageProps) {
  const user = await requireUser();
  if (!isOwner(user.actualEmail)) redirect("/admin");
  const params = (await searchParams) || {};
  const branch = await resolveAdminBranch(params.branch);
  const month = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : bangkokMonth();

  let data: ManHoursData | null = null;
  let error = "";
  try {
    data = await loadManHours(branch, month);
  } catch (err) {
    error = err instanceof Error ? err.message : "โหลดข้อมูลไม่ได้";
  }

  return (
    <main className="page sdoc-page mh-page">
      <Link href="/admin" className="back-link">← ศูนย์รวมงานจัดการ</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Man-hour · เฉพาะเจ้าของ</p>
          <h2>ภาระงานพนักงาน</h2>
          <p>
            ใส่เวลาที่แต่ละงานใช้จริง แล้วดูว่าถ้าน้องทำงานประจำครบ ต้องใช้เวลาเท่าไร เหลือเวลาว่างไหม หรือหนักเกินไป ·
            ไม่นับอีเวนต์พิเศษ (pre-release, Grand Opening, งานครั้งเดียว)
          </p>
        </div>
      </section>
      <div className="admin-branch-bar mh-toolbar">
        <AdminBranchSwitch value={branch} />
        <nav className="mh-month" aria-label="เลือกเดือน">
          <Link href={`/admin/man-hours?branch=${branch}&month=${addMonths(month, -1)}`} aria-label="เดือนก่อน">‹</Link>
          <span>{new Date(`${month}-15T12:00:00+07:00`).toLocaleDateString("th-TH", { month: "long", year: "numeric" })}</span>
          <Link href={`/admin/man-hours?branch=${branch}&month=${addMonths(month, 1)}`} aria-label="เดือนถัดไป">›</Link>
        </nav>
      </div>
      {error ? (
        <section className="sdoc-section">
          <p className="sdoc-error">{error}</p>
        </section>
      ) : data ? (
        <ManHoursBoard
          names={Object.fromEntries([...new Set(data.cells.map((cell) => cell.staffCode))].map((code) => [code, displayNameFor(code)]))}
          key={`${branch}-${month}`}
          branch={branch} month={month} canEdit={!user.isImpersonating} {...data} />
      ) : null}
    </main>
  );
}
