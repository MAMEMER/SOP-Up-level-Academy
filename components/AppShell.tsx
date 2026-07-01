import Link from "next/link";
import type { CurrentUser } from "../lib/auth.ts";

export function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  return (
    <div className="app-frame">
      <aside className="app-sidebar">
        <h2>SOP</h2>
        <nav>
          <Link href="/">หน้าหลัก</Link>
          <Link href="/departments">ฝ่ายงาน</Link>
          <Link href="/drafts">ร่างของฉัน</Link>
          {user.role === "admin" ? <Link href="/approvals">รออนุมัติ</Link> : null}
          {user.role === "admin" ? <Link href="/admin/users">ผู้ใช้</Link> : null}
        </nav>
      </aside>
      <div>
        <header className="app-header">
          {user.name} · {user.role}
        </header>
        {children}
      </div>
    </div>
  );
}
