import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { adminSections, adminSectionsFor, staffPagesSection } from "../lib/admin-sitemap.ts";
import { adminNav } from "../lib/nav-links.ts";

// ทุกหน้าใต้ /admin ต้องอยู่ในสารบัญ — กันหน้าใหม่ "หาไม่เจอ" อีก
function adminRoutes(dir: string, base = "/admin"): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory()) continue;
    if (name.startsWith("[")) continue; // หน้ารายละเอียด เข้าจากหน้าแม่
    const route = `${base}/${name}`;
    try {
      statSync(join(full, "page.tsx"));
      out.push(route);
    } catch {
      /* โฟลเดอร์ที่ไม่มีหน้า */
    }
  }
  return out;
}

const listed = new Set([...adminSections, staffPagesSection].flatMap((s) => s.links.map((l) => l.href)));

test("ทุกหน้า /admin/* อยู่ในสารบัญ", () => {
  const missing = adminRoutes(join(process.cwd(), "app/(dashboard)/admin")).filter((route) => !listed.has(route));
  assert.deepEqual(missing, []);
});

test("ไม่มีหน้าซ้ำสองหมวด", () => {
  const all = [...adminSections, staffPagesSection].flatMap((s) => s.links.map((l) => l.href));
  assert.equal(new Set(all).size, all.length);
});

test("แอดมินทั่วไปไม่เห็นหน้าเฉพาะเจ้าของ / หน้าจัดการบัญชี", () => {
  const hrefs = adminSectionsFor({ owner: false, staffAdmin: false }).flatMap((s) => s.links.map((l) => l.href));
  for (const hidden of ["/admin/activities", "/admin/stock-loss", "/admin/flower-target", "/admin/staff"]) assert.ok(!hrefs.includes(hidden), hidden);
  const ownerNav = adminNav({ owner: true, staffAdmin: true });
  assert.equal(ownerNav.tops[0].href, "/admin");
  assert.equal(ownerNav.groups.at(-1)?.key, "staff-pages");
});
