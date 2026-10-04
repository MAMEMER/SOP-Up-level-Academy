import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "../../../lib/auth.ts";
import { isOwner, canManageStaffAccounts } from "../../../lib/owner.ts";
import { getOpsSummary } from "../../../lib/ops-summary.ts";
import { formatWorkDate } from "../../../lib/workflow-records.ts";
import { getAdminNotifications } from "../../../lib/admin-notifications-server.ts";
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
// every tool grouped by what you came to do.

type Tool = {
  href: string;
  title: string;
  detail: string;
  /** live number worth acting on, shown as a badge */
  badge?: { count: number; label: string };
  ownerOnly?: boolean;
  /** หน้าที่เปิด/ปิดสิทธิ์เข้าระบบให้คนอื่น — เห็นเฉพาะบัญชีที่ดูแลรายชื่อ */
  staffAdminOnly?: boolean;
};

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
  // หน้าจัดการพนักงานย้ายมาอยู่ที่ /admin/staff ตอน /admin กลายเป็น hub — เลยยกปุ่มลัด
  // ขึ้นมาไว้บนสุดให้กดเข้าได้ทันที ไม่ต้องเลื่อนลงไปหาการ์ดเล็กๆ ท้ายหน้า (SOP bug: หน้าจัดการพนักงานหาย)
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

  const groups: Array<{ title: string; hint: string; tools: Tool[] }> = [
    {
      title: "ดูว่าวันนี้เป็นยังไง",
      hint: "เริ่มจากตรงนี้ทุกเช้า",
      tools: [
        {
          href: "/admin/ops",
          title: "รายละเอียดรายคน",
          detail: "เจาะดูรายคน — ใครทำอะไรไปแล้ว งานค้าง ปัญหาที่ต้องตาม (ตัวเลขสรุปรวมอยู่บนหน้านี้แล้ว)",
          badge: latePhases ? { count: latePhases, label: "เกินกำหนด" } : undefined
        },
        {
          href: "/admin/closing",
          title: "ปิดยอด 2 สาขา",
          detail: "เงินสดแต่ละสาขาตรงไหม · K SHOP สองเครื่องรวมกันตรงกับยอดธนาคารไหม"
        },
        {
          href: "/manager-review",
          title: "ตรวจงาน",
          detail: "งานที่พนักงานกดส่งตรวจ พร้อมหลักฐานที่แนบมา",
          badge: submittedPhases ? { count: submittedPhases, label: "ส่งมาแล้ว" } : undefined
        },
        {
          href: "/admin/staff-view",
          title: "มุมมองพนักงาน",
          detail: "เข้าดูเว็บในมุมมองของพนักงานคนนั้น เช็คว่าเขาเห็นอะไร"
        }
      ]
    },
    {
      title: "สั่งงาน / วางแผน",
      hint: "งานที่ทำล่วงหน้า",
      tools: [
        {
          href: "/admin/assign",
          title: "มอบหมายงาน",
          detail: "สั่งงานรายคน แนบไฟล์ได้ · ขึ้นบนหน้าของเขาทันทีที่ login",
          badge: openWork ? { count: openWork, label: "ยังไม่ส่ง" } : undefined
        },
        {
          href: "/admin/tasks",
          title: "สั่งงานประจำ",
          detail: "งานรายวัน/สัปดาห์/เดือน ที่เดียว — ลงวันไหน กะไหน เริ่มได้เมื่อไร จบไม่เกินเมื่อไร ส่งงานแบบไหน"
        },
        {
          href: "/admin/calendar",
          title: "ปฏิทินสั่งงาน",
          detail: "เห็นทั้งเดือนว่าวันไหนมีงาน/กิจกรรมอะไร กดวันนั้นสั่งงานได้เลย หรือสั่งเป็นทุกวันที่มีกิจกรรมนั้น"
        },
        {
          href: "/admin/activities",
          title: "ตารางกิจกรรมสองสาขา",
          detail: "บางแค × เสนาเฟสต์ วันไหนจัดอะไร และใครเข้ากะที่ไหน — ลากย้ายวัน/สาขาได้ เตือนเกมชนกันข้ามสาขา",
          ownerOnly: true
        },
        {
          href: "/admin/projects",
          title: "มอบหมายงาน (เดี่ยว/กลุ่ม)",
          detail: "งานวันเดียวหรือหลายวัน — ใครทำ เวลา ส่งงานแบบไหน · หลายวันดูความคืบหน้ารายวันเป็น %"
        },
        {
          href: "/admin/stock-runs",
          title: "ตรวจนับ Stock",
          detail: "มอบหมาย + ตรวจรับงานตรวจนับ Stock อุปกรณ์/Sleeve (สัปดาห์) และ Single card (เดือน) เป็นรายครั้ง พร้อมประวัติ"
        },
        { href: "/admin/schedule", title: "ตารางกะ", detail: "วางกะรายเดือน · ดึงเวลาเข้างานจริงจาก StoreHub มาเทียบ" },
        { href: "/admin/checklist-config", title: "ปรับ Checklist", detail: "แก้รายการ checklist ทั้ง Daily / Weekly / Monthly · เวลาส่ง ลำดับหัวข้อ และกะ" },
        { href: "/admin/manual-config", title: "แก้คู่มืองาน", detail: "แก้ขั้นตอน วัตถุประสงค์ ข้อควรระวัง ที่พนักงานอ่าน" }
      ]
    },
    {
      title: "ให้คะแนน / สรุปผล",
      hint: owner ? "มีตัวเลขการหักเงินอยู่ในนี้" : "ตัวเลขการหักเงินเห็นเฉพาะเจ้าของ",
      tools: [
        { href: "/admin/stock-check", title: "ลงคะแนน Stock", detail: "บันทึกผลนับ stock ของวันนั้น — ตรง / ไม่ตรง / ไม่ได้นับ" },
        { href: "/admin/checklist-audit", title: "สุ่มตรวจ Checklist", detail: "ติ๊กว่าทำแล้วแต่ไม่ได้ทำ — หัก 10 คะแนน + ธง coach" },
        {
          href: "/admin/performance-score",
          title: "คะแนนพนักงาน",
          detail: "KPI 5 หมวด · incentive · เหตุผลการหักคะแนนรายวัน",
          ownerOnly: false
        },
        {
          href: "/admin/flower-target",
          title: "เป้าดอกไม้",
          detail: "แต่ละคนต้องได้ดอกไม้กี่ % ของยอดขาย · รางวัลคนได้มากสุด · อันดับเดือนนี้",
          ownerOnly: true
        },
        {
          href: "/admin/stock-loss",
          title: "ของหาย น้ำ/ขนม",
          detail: "มูลค่าของที่หายรายรอบ · รายการที่หาย · จุดที่ควรตาม",
          ownerOnly: true
        },
        { href: "/admin/kpi-rules", title: "กติกาให้คะแนน", detail: "ดู logic การบวก/หักคะแนนทั้งหมด · เจ้าของปรับเรตได้" },
        { href: "/monthly-summary", title: "สรุปรายเดือน", detail: "งานที่ส่งตรวจทั้งเดือน และความครบถ้วนของ checklist" }
      ]
    },
    {
      title: "ตั้งค่า",
      hint: "นานๆ แก้ที",
      tools: [
        {
          href: "/admin/staff",
          title: "จัดการพนักงาน",
          detail: "เพิ่ม / แก้ / ปิดบัญชี · อีเมลที่ login ได้ · รหัสพนักงาน · ชื่อใน StoreHub",
          staffAdminOnly: true,
          badge: { count: staffCount, label: "คนเข้ากะวันนี้" }
        },
        {
          href: "/admin/staff-documents",
          title: "เอกสารพนักงาน",
          detail: "ใครส่งเอกสารประกันสังคม + บัญชีเงินเดือนแล้วบ้าง · ลิงก์โฟลเดอร์ในไดรฟ์",
          badge: docsMissing ? { count: docsMissing, label: "ยังไม่ส่ง" } : undefined
        }
      ]
    }
  ];

  return (
    <main className="page">
      <section className="board-hero">
        <div>
          <p className="eyebrow">ศูนย์รวมงานจัดการ</p>
          <h2>ศูนย์กลางงานจัดการ</h2>
          <p>ทุกอย่างที่ต้องใช้จัดการทีม อยู่ในหน้านี้ที่เดียว · {workDate}</p>
        </div>
        <div className="hero-actions">
          {canManageStaff ? (
            <Link href="/admin/staff" className="primary-action">จัดการพนักงาน</Link>
          ) : null}
          <Link href="/" className="soft-button">ดูหน้าพนักงาน</Link>
        </div>
      </section>

      <div className="admin-branch-bar">
        <AdminBranchSwitch value={view} allowAll />
      </div>

      <AdminNotificationCenter items={notifications} />

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

      {groups.map((group) => (
        <section key={group.title} className="admin-hub__group">
          <div className="section-heading">
            <p className="eyebrow">{group.hint}</p>
            <h3>{group.title}</h3>
          </div>
          <div className="admin-hub__tools">
            {group.tools
              .filter((tool) => !tool.staffAdminOnly || canManageStaffAccounts(user.actualEmail))
              .filter((tool) => !tool.ownerOnly || owner)
              .map((tool) => (
              <Link key={tool.href} href={tool.href} className="admin-hub__tool">
                <div>
                  <strong>{tool.title}</strong>
                  {tool.badge ? <em>{tool.badge.count} {tool.badge.label}</em> : null}
                </div>
                <small>{tool.detail}</small>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
