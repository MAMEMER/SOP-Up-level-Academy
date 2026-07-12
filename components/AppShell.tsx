import Link from "next/link";
import { redirect } from "next/navigation";
import { DigitalClock } from "./DigitalClock.tsx";
import type { CurrentUser } from "../lib/auth.ts";
import { createClient } from "../lib/supabase/server.ts";

const mainLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/checklist", label: "Checklist" },
  { href: "/training", label: "คู่มือ" }
];

const staffLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/checklist", label: "Checklist" },
  { href: "/training", label: "คู่มือ" }
];

const adminLinks = [
  { href: "/admin/ops", label: "Owner Summary" },
  { href: "/admin/performance-score", label: "Performance Score" },
  { href: "/manager-review", label: "Review" },
  { href: "/monthly-summary", label: "Monthly Summary" }
];

export function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const visibleMainLinks = user.role === "employee" ? staffLinks : mainLinks;

  async function logOut() {
    "use server";

    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-logo-image" src="/up-level-academy-logo.png" alt="UP LEVEL Academy" />
          <div>
            <strong>SOP_UPLEVEL</strong>
            <small>Checklist dashboard</small>
          </div>
        </div>
        <section>
          <p className="sidebar-label">Main</p>
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
            <p className="sidebar-label">Admin</p>
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
        <header className="topbar">
          <div>
            <p className="eyebrow">Workspace</p>
            <h1>{user.name}</h1>
            <p>
              {user.role} · {user.departmentId ? user.departmentId : "unassigned"}
            </p>
          </div>
          <div className="topbar-actions">
            <DigitalClock />
            <div className="user-chip">{user.email}</div>
            <form action={logOut}>
              <button type="submit" className="logout-button">Log out</button>
            </form>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
