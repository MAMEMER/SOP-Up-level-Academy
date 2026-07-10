import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { isPreviewMode, previewProfileForEmail, previewProfiles, previewUser } from "../lib/preview-data.ts";

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
    assert.equal(previewProfileForEmail("staff@example.com")?.name, "staff@example.com");
    assert.equal(previewProfileForEmail("staff@example.com")?.email, "staff@example.com");
  });

  it("uses the preview user id for the mock server auth user", () => {
    const serverSource = readFileSync("lib/supabase/server.ts", "utf8");

    assert.equal(serverSource.includes("previewProfileForEmail"), true);
    assert.equal(serverSource.includes('user: { id: "preview-admin" }'), false);
  });

  it("routes preview login directly to checklist", () => {
    const loginSource = readFileSync("app/(auth)/login/page.tsx", "utf8");

    assert.equal(loginSource.includes("previewLoginEmailCookieName"), true);
    assert.match(loginSource, /router\.push\("\/checklist"\)/);
  });

  it("keeps the root page as the dashboard for public access", () => {
    const rootSource = readFileSync("app/(dashboard)/page.tsx", "utf8");

    assert.equal(rootSource.includes('href="/checklist"'), true);
    assert.equal(rootSource.includes('redirect("/checklist")'), false);
  });
});
