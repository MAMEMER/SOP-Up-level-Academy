import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { DigitalClock } from "./DigitalClock.tsx";
import type { CurrentUser } from "../lib/auth.ts";
import { SOP_SESSION_COOKIE } from "../lib/auth-session.ts";
import { VIEW_AS_COOKIE } from "../lib/impersonation.ts";

const mainLinks = [
  { href: "/", label: "หน้าหลัก" },
  { href: "/my-view", label: "งานของฉัน" },
  { href: "/checklist", label: "เช็คลิสต์" },
  { href: "/handoff", label: "งานส่งต่อ" },
  { href: "/training", label: "คู่มืองาน" }
];

const staffLinks = mainLinks;

const adminLinks = [
  { href: "/admin/schedule", label: "ตารางกะ" },
  { href: "/admin/assign", label: "มอบหมายงาน" },
  { href: "/admin/staff-view", label: "มุมมองพนักงาน" },
  { href: "/admin/staff", label: "จัดการพนักงาน" },
  { href: "/admin/checklist-config", label: "ปรับ Checklist" },
  { href: "/admin/stock-check", label: "ลงคะแนน Stock" },
  { href: "/admin/ops", label: "สรุปเจ้าของร้าน" },
  { href: "/admin/performance-score", label: "คะแนนพนักงาน" },
  { href: "/manager-review", label: "ตรวจงาน" },
  { href: "/monthly-summary", label: "สรุปรายเดือน" }
];

const roleLabels: Record<string, string> = {
  admin: "แอดมิน",
  leader: "หัวหน้า",
  employee: "พนักงาน"
};

export function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const visibleMainLinks = user.role === "employee" ? staffLinks : mainLinks;

  async function logOut() {
    "use server";
    const jar = await cookies();
    jar.delete(SOP_SESSION_COOKIE);
    jar.delete(VIEW_AS_COOKIE);
    redirect("/login");
  }

  async function stopViewingAs() {
    "use server";
    (await cookies()).delete(VIEW_AS_COOKIE);
    redirect("/admin/staff-view");
  }

  return (
    <div className={user.isImpersonating ? "app-shell is-impersonating" : "app-shell"}>
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-logo-image" src="/up-level-academy-logo.png" alt="UP LEVEL Academy" />
          <div>
            <strong>SOP Up Level</strong>
            <small>คู่มืองาน + KPI พนักงาน</small>
          </div>
        </div>
        <section>
          <p className="sidebar-label">เมนู</p>
          <nav className="nav-list">
            {visibleMainLinks.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
        </section>
        {user.role === "admin" ? (
          <section>
            <p className="sidebar-label">แอดมิน</p>
            <nav className="nav-list">
              {adminLinks.map((item) => (
                <Link key={item.href} href={item.href}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </section>
        ) : null}
      </aside>
      <div className="workspace">
        {user.isImpersonating ? (
          <div className="impersonation-bar">
            <strong>กำลังดูในมุมมองของ {user.name}</strong>
            <span>ข้อมูลจริงของเขา · แก้ไขหรือส่งงานไม่ได้ · เข้าระบบอยู่ในชื่อ {user.actualName}</span>
            <form action={stopViewingAs}>
              <button type="submit" className="soft-button">กลับเป็นตัวเอง</button>
            </form>
          </div>
        ) : null}
        <header className="topbar">
          <div>
            <p className="eyebrow">พื้นที่ทำงาน</p>
            <h1>{user.name}</h1>
            <p>
              {roleLabels[user.role] ?? user.role} · {user.departmentId ? user.departmentId : "ยังไม่ระบุแผนก"}
            </p>
          </div>
          <div className="topbar-actions">
            <DigitalClock />
            <div className="user-chip">{user.email}</div>
            <form action={logOut}>
              <button type="submit" className="logout-button">ออกจากระบบ</button>
            </form>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
