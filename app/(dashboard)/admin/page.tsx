import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "../../../lib/auth.ts";
import { isOwner, canManageStaffAccounts } from "../../../lib/owner.ts";
import { getOpsSummary } from "../../../lib/ops-summary.ts";
import { formatWorkDate } from "../../../lib/workflow-records.ts";
import { getAdminNotifications } from "../../../lib/admin-notifications-server.ts";
import { AdminDirectory, type DirectoryBadge } from "../../../components/AdminDirectory.tsx";
import { adminSectionsFor } from "../../../lib/admin-sitemap.ts";
import { AdminNotificationCenter } from "../../../components/AdminNotificationCenter.tsx";
import { DeliveryOrdersBoard } from "../../../components/DeliveryOrdersBoard.tsx";
import { WorkflowReviewRecords } from "../../../components/WorkflowReviewRecords.tsx";
import { syncDeliveryTasks } from "../../../lib/delivery-tasks-server.ts";
import { DELIVERY_BRANCH, deliveryTaskVisibleTo, sortDeliveryTasks } from "../../../lib/delivery-tasks.ts";
import { branchesForView, resolveAdminBranchView } from "../../../lib/admin-branch.ts";
import { branchColor, branchShortName } from "../../../lib/store-config.ts";
import { AdminBranchSwitch } from "../../../components/AdminBranchSwitch.tsx";
import type { DeliveryTask } from "../../../lib/delivery-tasks.ts";
import { getShopSyncStatus } from "../../../lib/shop-sync-status.ts";
import { ShopStockSyncPanel } from "../../../components/ShopStockSyncPanel.tsx";
import { docIdFor, eligibleStaff, listDocRecords } from "../../../lib/staff-documents-server.ts";
import { docsStatus } from "../../../lib/staff-documents.ts";

// The owner's home. Signed in as an admin, "/" is still the staff dashboard — a personal
// checklist nobody in charge fills in — so running the day meant hunting through ten nav
// links. This page is the one place to start from: what needs attention right now, then
// every tool grouped by what you came to do. The menu itself comes from lib/admin-sitemap.ts
// (same list as the top nav) so a page can never be in one and missing from the other.

// ตัวเลขบนหน้านี้ต้องสดเสมอ — เจ้าของร้านใช้ตัดสินใจว่าจะไปตามเรื่องไหนก่อน
export const dynamic = "force-dynamic";

export default async function AdminHubPage({ searchParams }: { searchParams?: Promise<{ branch?: string }> }) {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const workDate = formatWorkDate();
  // ดูสองสาขาคู่กัน (ค่าเริ่มต้น) หรือทีละสาขา — ตัวเลขทุกตัวบนหน้านี้คิดแยกต่อสาขา
  const view = await resolveAdminBranchView((searchParams ? await searchParams : {}).branch);
  const branches = branchesForView(view);
  const summaries = await Promise.all(branches.map(async (branch) => ({ branch, summary: await getOpsSummary(workDate, branch) })));
  const showsDelivery = branches.includes(DELIVERY_BRANCH);
  // งานส่งของ (ออเดอร์ออนไลน์ = สาขา DELIVERY_BRANCH): sync ครั้งเดียวตรงนี้ แล้วส่งต่อให้ทั้งบอร์ดและ
  // ศูนย์แจ้งเตือน — ไม่ยิงซ้ำสองรอบ. admin เห็นทุกใบ (visibleTo คืน true).
  const deliveryAll = showsDelivery ? await syncDeliveryTasks().catch(() => [] as DeliveryTask[]) : [];
  const deliveryTasks = sortDeliveryTasks(
    deliveryAll.filter((task) =>
      deliveryTaskVisibleTo(task, { isAdmin: true, staffCode: null, shiftToday: null, today: workDate })
    ),
    workDate
  );
  // ทุกเรื่องค้างจากทุกหน้า รวมมาไว้บนสุดของ hub — ไม่ต้องไล่เปิดทีละหน้าถึงจะรู้
  const notifications = await getAdminNotifications(summaries, workDate, deliveryTasks);
  // สถานะ sync สต็อกร้านออนไลน์ล่าสุด (StoreHub → shop-products) — โชว์ให้เจ้าของกด sync เองได้
  const shopSyncStatus = await getShopSyncStatus();
  const owner = isOwner(user.email);
  // หน้าจัดการพนักงาน (/admin/staff) เห็นเฉพาะคนที่ดูแลรายชื่อ — อยู่หมวด "พนักงาน" ทั้งในเมนูบนและสารบัญ
  const canManageStaff = canManageStaffAccounts(user.actualEmail);

  // เอกสารประกันสังคมที่พนักงานยังไม่ส่ง — อ่านพลาดก็แค่ไม่มีตัวเลข ไม่ทำให้ hub พัง
  const docsMissing = await Promise.all([eligibleStaff(), listDocRecords()])
    .then(([people, records]) => people.filter((person) => docsStatus(records.get(docIdFor(person))) === "not_submitted").length)
    .catch(() => 0);

  const pulses = summaries.map(({ branch, summary }) => ({
    branch,
    summary,
    waitingReview: summary.assignments.filter((item) => item.status === "submitted").length,
    openWork: summary.assignments.filter((item) => item.status === "open").length,
    checklistPercent: summary.daily.total > 0 ? Math.round((summary.daily.completed / summary.daily.total) * 100) : 0
  }));
  const sumOf = (pick: (summary: (typeof summaries)[number]["summary"]) => number) =>
    summaries.reduce((total, entry) => total + pick(entry.summary), 0);
  const openWork = pulses.reduce((total, entry) => total + entry.openWork, 0);
  const latePhases = sumOf((summary) => summary.daily.latePhases);
  const submittedPhases = sumOf((summary) => summary.daily.submittedPhases);
  // คนที่เข้ากะวันนี้ในสาขาที่กำลังดู (เริ่ม checklist แล้ว + ยังไม่เริ่ม)
  const staffCount = sumOf((summary) => summary.staff.length + summary.noRecordStaff.length);

  // ตัวเลขที่ควรรู้ก่อนกด — ผูกกับหน้าในสารบัญ (lib/admin-sitemap.ts)
  const badges: Record<string, DirectoryBadge | undefined> = {
    "/admin/ops": latePhases ? { count: latePhases, label: "เกินกำหนด" } : undefined,
    "/manager-review": submittedPhases ? { count: submittedPhases, label: "ส่งมาแล้ว" } : undefined,
    "/admin/assign": openWork ? { count: openWork, label: "ยังไม่ส่ง" } : undefined,
    "/admin/staff": staffCount ? { count: staffCount, label: "คนเข้ากะวันนี้" } : undefined,
    "/admin/staff-documents": docsMissing ? { count: docsMissing, label: "ยังไม่ส่ง" } : undefined
  };
  const sections = adminSectionsFor({ owner, staffAdmin: canManageStaff });

  return (
    <main className="page">
      <section className="board-hero">
        <div>
          <p className="eyebrow">{workDate}</p>
          <h2>หน้าหลักเจ้าของ</h2>
          <p>บนสุด = เรื่องที่ต้องตามวันนี้ · ถัดลงมา = ทุกเมนู ค้นหาได้ · ตัวเลขแต่ละสาขาอยู่ด้านล่าง</p>
        </div>
      </section>

      <div className="admin-branch-bar">
        <AdminBranchSwitch value={view} allowAll />
      </div>

      <AdminNotificationCenter items={notifications} />

      <AdminDirectory sections={sections} badges={badges} />

      <div className={pulses.length > 1 ? "admin-branch-cols" : undefined}>
        {pulses.map(({ branch, summary, waitingReview, openWork: open, checklistPercent }) => (
          <section key={branch} className="admin-branch-col" style={{ ["--branch-color" as string]: branchColor(branch) }}>
            <h3><i aria-hidden />{branchShortName(branch)}</h3>
            <div className="admin-hub__pulse">
              <Link href={`/admin/ops?branch=${branch}`} className="board-stat">
                <span>Checklist วันนี้</span>
                <strong>{checklistPercent}%</strong>
                <small>{summary.daily.completed}/{summary.daily.total} ข้อ · {summary.staff.length} คนเริ่มแล้ว</small>
              </Link>
              <Link href="/manager-review" className="board-stat">
                <span>รอตรวจ</span>
                <strong className={waitingReview ? "is-alert" : undefined}>{waitingReview}</strong>
                <small>งานที่พนักงานส่งมา</small>
              </Link>
              <Link href={`/admin/assign?branch=${branch}`} className="board-stat">
                <span>งานค้าง</span>
                <strong className={open ? "is-alert" : undefined}>{open}</strong>
                <small>มอบหมายแล้วยังไม่ส่ง</small>
              </Link>
              <Link href={`/admin/ops?branch=${branch}`} className="board-stat">
                <span>งานส่งต่อ</span>
                <strong className={summary.handoffs.length ? "is-alert" : undefined}>{summary.handoffs.length}</strong>
                <small>ค้างข้ามกะ</small>
              </Link>
            </div>
          </section>
        ))}
      </div>

      {/* งานส่งของ — ออเดอร์ออนไลน์ทั้งหมดเป็นงานของสาขา DELIVERY_BRANCH */}
      {showsDelivery ? (
        <DeliveryOrdersBoard
          branch={DELIVERY_BRANCH}
          initialTasks={deliveryTasks}
          initialToday={workDate}
          initialShift={null}
          canAct={!user.isImpersonating}
        />
      ) : null}

      {/* คิวตรวจงาน — ยกจาก /manager-review มาไว้บน hub ตรงนี้ด้วย */}
      <WorkflowReviewRecords />

      {/* สต็อกร้านออนไลน์ — sync อัตโนมัติทุกคืน + ปุ่ม sync ตอนนี้ */}
      <section className="admin-hub__group">
        <div className="section-heading">
          <p className="eyebrow">ร้านออนไลน์</p>
          <h3>สต็อก uplevelguild.com/shop</h3>
        </div>
        <div className="admin-hub__tools">
          <ShopStockSyncPanel initialStatus={shopSyncStatus} />
        </div>
      </section>

    </main>
  );
}
