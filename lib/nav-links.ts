import { ADMIN_HOME, adminSectionsFor, staffPagesSection, type SiteSection, type SiteViewer } from "./admin-sitemap.ts";

// เมนูของเว็บ — จัดเป็นกลุ่มแทนการวางปุ่มทุกปุ่มเรียงกัน เพราะบนมือถือ ~25 ปุ่มกลายเป็น
// กำแพงปุ่มที่หาอะไรไม่เจอ. หน้าที่ใช้ทุกวัน (หน้าหลัก) อยู่นอกกลุ่ม กดถึงได้ตลอด.

/** exact = ไฮไลต์เฉพาะ path นี้ตรงๆ (เช่น /admin ไม่ควรสว่างตอนอยู่ /admin/calendar) */
export type NavLink = { href: string; label: string; exact?: boolean };
export type NavGroup = { key: string; label: string; links: NavLink[] };

/** ลิงก์ที่โผล่ตลอด ไม่ต้องเปิดกลุ่ม */
export const quickLinks: NavLink[] = [
  { href: "/", label: "หน้าหลัก" },
  { href: "/my-view", label: "งานของฉัน" },
  { href: "/my-tasks", label: "แจ้งเตือนงาน" },
  { href: "/my-review", label: "ผลงานของฉัน" },
  { href: "/flowers", label: "ดอกไม้" }
];

export const staffGroups: NavGroup[] = [
  {
    key: "work",
    label: "งานที่ต้องทำ",
    links: [
      { href: "/tasks", label: "งานวันนี้" },
      // ส่งต่องานย้ายเข้ามาอยู่ในการ์ดของ "งานที่มอบหมาย" แล้ว (ใบงาน iDBqn3jE) — หน้า /handoff
      // เดิมยังเปิดได้จากลิงก์ตรงเพื่อดูงานที่ค้างอยู่ในระบบเก่า แต่ไม่ต้องมีเมนูซ้ำอีกช่อง
      { href: "/my-tasks/file", label: "แฟ้มงาน" },
      { href: "/parcels", label: "พัสดุการ์ด" },
      { href: "/my-documents", label: "เอกสารของฉัน" }
    ]
  },
  {
    key: "routine",
    label: "เช็คลิสต์และตาราง",
    links: [
      { href: "/checklist", label: "เช็คลิสต์" },
      { href: "/closing", label: "ปิดยอด" },
      { href: "/supplies", label: "ของที่ต้องสั่ง" },
      { href: "/card-prices", label: "ราคากลางการ์ด" },
      { href: "/schedule", label: "ตารางกะ" },
      { href: "/training", label: "คู่มืองาน" }
    ]
  }
];

/** เมนูของแอดมิน — อ่านจากสารบัญเดียว (lib/admin-sitemap.ts) ชุดเดียวกับหน้ารวม /admin.
 * แอดมินไม่เห็นเมนูพนักงานปนอยู่ด้านบน: หน้าพนักงานรวมอยู่หมวด "หน้าพนักงาน" หมวดเดียว */
export function adminNav(viewer: SiteViewer): { tops: NavLink[]; groups: NavGroup[] } {
  const toGroup = (section: SiteSection): NavGroup => ({
    key: section.key,
    label: section.label,
    links: section.links.map((link) => ({ href: link.href, label: link.label, exact: link.href === "/" }))
  });
  return {
    tops: [{ href: ADMIN_HOME.href, label: ADMIN_HOME.label, exact: true }],
    groups: [...adminSectionsFor(viewer).map(toGroup), toGroup(staffPagesSection)]
  };
}

/** กลุ่มไหนคือกลุ่มของหน้าที่เปิดอยู่ — ใช้เปิดกลุ่มนั้นค้างไว้ให้รู้ว่าตัวเองอยู่ตรงไหน */
export function groupOfPath(groups: NavGroup[], pathname: string): string | null {
  let best: { key: string; length: number } | null = null;
  for (const group of groups) {
    for (const link of group.links) {
      if (isActivePath(link.href, pathname, link.exact)) {
        if (!best || link.href.length > best.length) best = { key: group.key, length: link.href.length };
      }
    }
  }
  return best ? best.key : null;
}

export function isActivePath(href: string, pathname: string, exact = false): boolean {
  if (exact || href === "/") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
