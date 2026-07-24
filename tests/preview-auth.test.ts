import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { allowedPreviewLoginEmails, isPreviewMode, previewProfileForEmail, previewProfiles, previewUser } from "../lib/preview-data.ts";

describe("preview auth", () => {
  it("keeps the web app public by default even when Supabase env vars exist", () => {
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const originalSiteAccess = process.env.NEXT_PUBLIC_SITE_ACCESS;

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    delete process.env.NEXT_PUBLIC_SITE_ACCESS;

    assert.equal(isPreviewMode(), true);

    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;

    if (originalAnonKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;

    if (originalSiteAccess === undefined) delete process.env.NEXT_PUBLIC_SITE_ACCESS;
    else process.env.NEXT_PUBLIC_SITE_ACCESS = originalSiteAccess;
  });

  it("uses champ.championest@gmail.com as the default admin preview user", () => {
    const profile = previewProfiles.find((item) => item.id === previewUser.id);

    assert.equal(previewUser.name, "Champ Master");
    assert.equal(previewUser.email, "champ.championest@gmail.com");
    assert.equal(previewUser.role, "admin");
    assert.equal(profile?.name, "Champ Master");
    assert.equal(profile?.email, "champ.championest@gmail.com");
    assert.equal(profile?.role, "admin");
  });

  it("includes champ.championest@gmail.com as an admin profile", () => {
    const profiles = previewProfiles.filter((item) => item.email === "champ.championest@gmail.com");
    const profile = profiles[0];

    assert.equal(profiles.length, 1);
    assert.equal(profile?.name, "Champ Master");
    assert.equal(profile?.role, "admin");
    assert.equal(profile?.active, true);
  });

  it("selects the preview profile that matches the login email", () => {
    const profile = previewProfileForEmail("namenrw@gmail.com");

    assert.equal(profile?.name, "Namen RW");
    assert.equal(profile?.email, "namenrw@gmail.com");
    assert.equal(previewProfileForEmail(" NAMENRW@GMAIL.COM ")?.id, profile?.id);
    assert.equal(previewProfileForEmail("staff@example.com"), undefined);
  });

  it("allows only the approved admin and staff login emails", () => {
    assert.deepEqual(allowedPreviewLoginEmails, [
      "namenrw@gmail.com",
      "champ.championest@gmail.com",
      "boomboom08755@gmail.com",
      "phooreephat.k@gmail.com",
      "nuslove2560@gmail.com"
    ]);
    assert.equal(previewProfileForEmail("random@example.com"), undefined);
  });

  it("maps named staff emails to employee preview profiles", () => {
    assert.deepEqual(
      ["boomboom08755@gmail.com", "phooreephat.k@gmail.com", "nuslove2560@gmail.com"].map((email) => {
        const profile = previewProfileForEmail(email);
        return [profile?.email, profile?.name, profile?.role, profile?.department_id];
      }),
      [
        ["boomboom08755@gmail.com", "บูม", "employee", "front-store"],
        ["phooreephat.k@gmail.com", "ไอซ์", "employee", "front-store"],
        ["nuslove2560@gmail.com", "ลีโอ", "employee", "front-store"]
      ]
    );
  });

  it("limits employee staff navigation to หน้าหลัก, เช็คลิสต์, and คู่มืองาน", () => {
    const appShellSource = readFileSync("components/AppShell.tsx", "utf8");

    assert.equal(appShellSource.includes("staffLinks"), true);
    assert.equal(appShellSource.includes('{ href: "/", label: "หน้าหลัก" }'), true);
    assert.equal(appShellSource.includes('{ href: "/checklist", label: "เช็คลิสต์" }'), true);
    assert.equal(appShellSource.includes('{ href: "/training", label: "คู่มืองาน" }'), true);
    assert.equal(appShellSource.includes('user.role === "employee" ? staffLinks'), true);
  });

  it("uses the preview user id for the mock server auth user", () => {
    const serverSource = readFileSync("lib/supabase/server.ts", "utf8");

    assert.equal(serverSource.includes("previewProfileForEmail"), true);
    assert.equal(serverSource.includes('user: { id: "preview-admin" }'), false);
    assert.equal(serverSource.includes("previewLoginAllowed"), true);
    assert.equal(serverSource.includes("user: null"), true);
  });

  it("signs in with Google and routes to the dashboard", () => {
    const loginSource = readFileSync("app/(auth)/login/page.tsx", "utf8");

    // Auth is now Firebase Google sign-in → session cookie via /api/auth/session.
    assert.match(loginSource, /signInWithPopup/);
    assert.match(loginSource, /\/api\/auth\/session/);
    assert.match(loginSource, /router\.push\("\/"\)/);
    assert.doesNotMatch(loginSource, /router\.push\("\/checklist"\)/);
  });

  it("keeps the root page as the dashboard for public access", () => {
    const rootSource = readFileSync("app/(dashboard)/page.tsx", "utf8");

    assert.equal(rootSource.includes('href="/checklist"'), true);
    assert.equal(rootSource.includes('redirect("/checklist")'), false);
  });

  it("does not show product arrangement example images on the dashboard", () => {
    const rootSource = readFileSync("app/(dashboard)/page.tsx", "utf8");

    assert.equal(rootSource.includes("product-arrangement-grid"), false);
    assert.equal(rootSource.includes("/training/snack-shelf-opening.jpg"), false);
    assert.equal(rootSource.includes("/training/equipment-cabinet.jpg"), false);
    assert.equal(rootSource.includes("มาตรฐานรูป"), false);
  });

  it("uses only neutral box colors on the dashboard", () => {
    const styles = readFileSync("app/globals.css", "utf8");
    const checklistStatusStyles = styles.slice(styles.indexOf(".checklist-status"), styles.indexOf(".section-title"));
    const dashboardTaskStyles = styles.slice(styles.indexOf(".task-sections"), styles.indexOf(".workflow-timeline"));
    const workflowStatusStyles = styles.slice(styles.indexOf(".workflow-status-white"), styles.indexOf(".workflow-tile p"));

    for (const section of [checklistStatusStyles, dashboardTaskStyles, workflowStatusStyles]) {
      assert.equal(section.includes("background: #f0fdf4"), false);
      assert.equal(section.includes("background: #ecfeff"), false);
      assert.equal(section.includes("background: #fffbeb"), false);
      assert.equal(section.includes("background: #f5f3ff"), false);
      assert.equal(section.includes("background: #dcfce7"), false);
      assert.equal(section.includes("background: #ffedd5"), false);
      assert.equal(section.includes("background: #fee2e2"), false);
      assert.equal(section.includes("background: #ede9fe"), false);
      assert.equal(section.includes("border-left-color: #15803d"), false);
      assert.equal(section.includes("border-left-color: #ea580c"), false);
      assert.equal(section.includes("border-left-color: #b42318"), false);
      assert.equal(section.includes("border-left-color: #7c3aed"), false);
    }
  });

  it("uses the UP LEVEL logo as the site brand and browser icon", () => {
    const appShellSource = readFileSync("components/AppShell.tsx", "utf8");
    const layoutSource = readFileSync("app/layout.tsx", "utf8");

    assert.equal(appShellSource.includes("/up-level-academy-logo.png"), true);
    assert.equal(appShellSource.includes("brand-logo-image"), true);
    assert.equal(layoutSource.includes('icon: "/up-level-academy-logo.png"'), true);
    assert.equal(layoutSource.includes('apple: "/up-level-academy-logo.png"'), true);
  });

  it("applies a clean Up Level Guild dashboard structure", () => {
    const rootSource = readFileSync("app/(dashboard)/page.tsx", "utf8");
    const styles = readFileSync("app/globals.css", "utf8");

    // Guild-style: compact hero + progress + tasks, no redundant category-strip clutter
    assert.equal(rootSource.includes("SOP Up Level"), true);
    assert.equal(rootSource.includes("DashboardChecklistStatus"), true);
    assert.equal(rootSource.includes("DashboardTaskSections"), true);
    assert.equal(rootSource.includes("apple-category-strip"), false);
    // Guild design system tokens applied
    assert.equal(styles.includes("--color-orange"), true);
    assert.equal(styles.includes(".soft-card"), true);
  });
});
