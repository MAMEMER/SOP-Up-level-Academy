import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "../../../lib/auth.ts";
import { isOwner } from "../../../lib/owner.ts";
import { getOpsSummary } from "../../../lib/ops-summary.ts";
import { formatWorkDate } from "../../../lib/workflow-records.ts";
import { getAdminNotifications } from "../../../lib/admin-notifications-server.ts";
import { AdminNotificationCenter } from "../../../components/AdminNotificationCenter.tsx";

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
};

// ตัวเลขบนหน้านี้ต้องสดเสมอ — เจ้าของร้านใช้ตัดสินใจว่าจะไปตามเรื่องไหนก่อน
export const dynamic = "force-dynamic";

export default async function AdminHubPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const workDate = formatWorkDate();
  const summary = await getOpsSummary(workDate);
  // ทุกเรื่องค้างจากทุกหน้า รวมมาไว้บนสุดของ hub — ไม่ต้องไล่เปิดทีละหน้าถึงจะรู้
  const notifications = await getAdminNotifications(summary, workDate);
  const owner = isOwner(user.email);

  const waitingReview = summary.assignments.filter((item) => item.status === "submitted").length;
  const openWork = summary.assignments.filter((item) => item.status === "open").length;
  const checklistPercent = summary.daily.total > 0 ? Math.round((summary.daily.completed / summary.daily.total) * 100) : 0;

  const groups: Array<{ title: string; hint: string; tools: Tool[] }> = [
    {
      title: "ดูว่าวันนี้เป็นยังไง",
      hint: "เริ่มจากตรงนี้ทุกเช้า",
      tools: [
        {
          href: "/admin/ops",
          title: "สรุปเจ้าของร้าน",
          detail: "ภาพรวมวันนี้ทั้งร้าน — ใครทำอะไรไปแล้ว งานค้าง ปัญหาที่ต้องตาม",
          badge: summary.daily.latePhases ? { count: summary.daily.latePhases, label: "เกินกำหนด" } : undefined
        },
        {
          href: "/manager-review",
          title: "ตรวจงาน",
          detail: "งานที่พนักงานกดส่งตรวจ พร้อมหลักฐานที่แนบมา",
          badge: summary.daily.submittedPhases ? { count: summary.daily.submittedPhases, label: "ส่งมาแล้ว" } : undefined
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
          detail: "เพิ่ม / แก้ / ปิดบัญชี · รหัสพนักงาน · ชื่อใน StoreHub",
          badge: { count: summary.staff.length + summary.noRecordStaff.length, label: "คน" }
        }
      ]
    }
  ];

  return (
    <main className="page">
      <section className="board-hero">
        <div>
          <p className="eyebrow">ADMIN HUB</p>
          <h2>ศูนย์กลางเจ้าของร้าน</h2>
          <p>ทุกอย่างที่ต้องใช้จัดการทีม อยู่ในหน้านี้ที่เดียว · {workDate}</p>
        </div>
        <div className="hero-actions">
          <Link href="/" className="soft-button">ดูหน้าพนักงาน</Link>
        </div>
      </section>

      <AdminNotificationCenter items={notifications} />

      <section className="admin-hub__pulse">
        <Link href="/manager-review" className="board-stat">
          <span>Checklist วันนี้</span>
          <strong>{checklistPercent}%</strong>
          <small>{summary.daily.completed}/{summary.daily.total} ข้อ · {summary.staff.length} คนเริ่มแล้ว</small>
        </Link>
        <Link href="/manager-review" className="board-stat">
          <span>รอตรวจ</span>
          <strong className={waitingReview ? "is-alert" : undefined}>{waitingReview}</strong>
          <small>งานที่พนักงานส่งมา</small>
        </Link>
        <Link href="/admin/assign" className="board-stat">
          <span>งานค้าง</span>
          <strong className={openWork ? "is-alert" : undefined}>{openWork}</strong>
          <small>มอบหมายแล้วยังไม่ส่ง</small>
        </Link>
        <Link href="/handoff" className="board-stat">
          <span>งานส่งต่อ</span>
          <strong className={summary.handoffs.length ? "is-alert" : undefined}>{summary.handoffs.length}</strong>
          <small>ค้างข้ามกะ</small>
        </Link>
      </section>

      {groups.map((group) => (
        <section key={group.title} className="admin-hub__group">
          <div className="section-heading">
            <p className="eyebrow">{group.hint}</p>
            <h3>{group.title}</h3>
          </div>
          <div className="admin-hub__tools">
            {group.tools.map((tool) => (
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
