# Board Style Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the SOP website shell into a board-style workspace with clearer management navigation and a stronger task-oriented landing page.

**Architecture:** Keep the existing SOP data flow and permissions intact. Update the shared app shell to behave like a workspace console, then refresh the dashboard landing page and SOP list presentation so they read like a managed work queue instead of a simple list.

**Tech Stack:** Next.js App Router, React server components, TypeScript, existing global CSS.

---

### Task 1: Reshape the shared app shell

**Files:**
- Modify: `components/AppShell.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Update the shell markup to group navigation into workspace sections**

```tsx
import Link from "next/link";
import type { CurrentUser } from "../lib/auth.ts";

const mainLinks = [
  { href: "/", label: "Board" },
  { href: "/departments", label: "Departments" },
  { href: "/drafts", label: "Drafts" }
];

const adminLinks = [
  { href: "/approvals", label: "Approvals" },
  { href: "/admin/users", label: "Users" }
];

export function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <strong>SOP</strong>
            <small>Operations workspace</small>
          </div>
        </div>
        <section>
          <p className="sidebar-label">Main</p>
          <nav className="nav-list">
            {mainLinks.map((item) => (
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
      <div className="workspace-main">
        <header className="workspace-topbar">
          <div>
            <p className="eyebrow">Workspace</p>
            <h1>{user.name}</h1>
            <p>{user.role} · {user.departmentId ? user.departmentId : "unassigned"}</p>
          </div>
          <div className="user-chip">{user.email}</div>
        </header>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the matching layout and navigation styles**

```css
.workspace-shell {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  min-height: 100vh;
  background: #eef2f5;
}

.workspace-sidebar {
  padding: 24px 18px;
  background: #101826;
  color: #fff;
  display: grid;
  gap: 28px;
  align-content: start;
}

.sidebar-label,
.eyebrow {
  margin: 0 0 10px;
  font-size: 12px;
  letter-spacing: 0;
  text-transform: uppercase;
  color: #94a3b8;
}

.workspace-main {
  padding: 28px;
}

.workspace-topbar {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: flex-start;
  margin-bottom: 22px;
}
```

- [ ] **Step 3: Verify the shell still renders for all user roles**

Run: `npm run build`
Expected: build exits 0 with the new shell classes referenced from the app shell.

### Task 2: Make the dashboard read like a board

**Files:**
- Modify: `app/(dashboard)/page.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Replace the plain heading with a board-style summary and latest-work section**

```tsx
import { SopList } from "../../components/SopList.tsx";
import { requireUser } from "../../lib/auth.ts";
import { createClient } from "../../lib/supabase/server.ts";

type SopRow = {
  id: string;
  title: string;
  status: "draft" | "pending_approval" | "published" | "needs_revision";
  departments: Array<{ display_name: string }> | null;
};

export default async function HomePage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("sops")
    .select("id,title,status,departments(display_name)")
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(10);

  const items = (data ? data : []).map((sop: SopRow) => ({
    id: sop.id,
    title: sop.title,
    status: sop.status,
    departmentName: (sop.departments as Array<{ display_name: string }> | null)?.[0]?.display_name || ""
  }));

  return (
    <main className="page">
      <section className="board-hero">
        <div>
          <p className="eyebrow">Operations board</p>
          <h2>งาน SOP ล่าสุด</h2>
          <p>ดูงานที่พร้อมใช้งานและสิ่งที่ต้องดูแลต่อจากหน้าเดียว</p>
        </div>
        <div className="board-stat">
          <span>Published</span>
          <strong>{items.length}</strong>
        </div>
      </section>
      <h3 className="section-title">Latest SOPs</h3>
      <SopList items={items} />
    </main>
  );
}
```

- [ ] **Step 2: Add visual treatment for the board header**

```css
.board-hero {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: stretch;
  background: #fff;
  border: 1px solid #d9e0e7;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 18px;
}

.board-stat {
  min-width: 120px;
  display: grid;
  align-content: space-between;
  padding: 14px 16px;
  border-radius: 8px;
  background: #17202a;
  color: #fff;
}

.section-title {
  margin: 0 0 12px;
}
```

- [ ] **Step 3: Verify the page still loads with preview data**

Run: `npm run build`
Expected: the dashboard page builds and the summary renders with preview or live data.

### Task 3: Tighten SOP list presentation

**Files:**
- Modify: `components/SopList.tsx`
- Modify: `components/StatusBadge.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Turn each SOP row into a richer work item**

```tsx
import Link from "next/link";
import { StatusBadge } from "./StatusBadge.tsx";
import type { SopStatus } from "../lib/permissions.ts";

export type SopListItem = {
  id: string;
  title: string;
  status: SopStatus;
  departmentName: string;
};

export function SopList({ items }: { items: SopListItem[] }) {
  return (
    <div className="work-list">
      {items.map((item) => (
        <Link key={item.id} href={`/sops/${item.id}`} className="work-row">
          <div>
            <strong>{item.title}</strong>
            <span>{item.departmentName}</span>
          </div>
          <StatusBadge status={item.status} />
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Make statuses look like board chips**

```tsx
import type { SopStatus } from "../lib/permissions.ts";

const labels: Record<SopStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  published: "Published",
  needs_revision: "Needs revision"
};

export function StatusBadge({ status }: { status: SopStatus }) {
  return <span className={`status status-${status}`}>{labels[status]}</span>;
}
```

- [ ] **Step 3: Add the row and chip styles**

```css
.work-list {
  display: grid;
  gap: 12px;
}

.work-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  background: #fff;
  border: 1px solid #d9e0e7;
  border-radius: 8px;
  padding: 16px 18px;
}

.work-row div {
  display: grid;
  gap: 4px;
}

.work-row span {
  color: #6b7785;
  font-size: 14px;
}

.status {
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  white-space: nowrap;
}

.status-draft { background: #e8edf2; color: #445162; }
.status-pending-approval { background: #fff2cc; color: #7a5d00; }
.status-published { background: #dcfce7; color: #166534; }
.status-needs-revision { background: #fee2e2; color: #991b1b; }
```

- [ ] **Step 4: Verify list rows and badges render correctly**

Run: `npm run build`
Expected: build exits 0 and the work list styles compile.

### Task 4: Verify final behavior in the browser

**Files:**
- No code changes expected

- [ ] **Step 1: Run the app and open the dashboard preview**

Run: `npm run dev`
Expected: local app starts successfully.

- [ ] **Step 2: Check the board-style shell and dashboard in the browser**

Expected: sidebar sections are visible, the top bar reads like a workspace header, and the SOP rows look like managed work items.

