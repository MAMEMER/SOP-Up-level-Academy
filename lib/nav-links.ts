// เมนูของเว็บ — จัดเป็นกลุ่มแทนการวางปุ่มทุกปุ่มเรียงกัน เพราะบนมือถือ ~25 ปุ่มกลายเป็น
// กำแพงปุ่มที่หาอะไรไม่เจอ. หน้าที่ใช้ทุกวัน (หน้าหลัก) อยู่นอกกลุ่ม กดถึงได้ตลอด.

/** exact = ไฮไลต์เฉพาะ path นี้ตรงๆ (เช่น /admin ไม่ควรสว่างตอนอยู่ /admin/calendar) */
export type NavLink = { href: string; label: string; exact?: boolean };
export type NavGroup = { key: string; label: string; links: NavLink[] };

/** ลิงก์ที่โผล่ตลอด ไม่ต้องเปิดกลุ่ม */
export const quickLinks: NavLink[] = [
  { href: "/", label: "หน้าหลัก" },
  { href: "/my-view", label: "งานของฉัน" },
  { href: "/my-review", label: "ผลงานของฉัน" }
];

export const staffGroups: NavGroup[] = [
  {
    key: "work",
    label: "งานที่ต้องทำ",
    links: [
      { href: "/tasks", label: "งานวันนี้" },
      // ส่งต่องานย้ายเข้ามาอยู่ในการ์ดของ "งานที่มอบหมาย" แล้ว (ใบงาน iDBqn3jE) — หน้า /handoff
      // เดิมยังเปิดได้จากลิงก์ตรงเพื่อดูงานที่ค้างอยู่ในระบบเก่า แต่ไม่ต้องมีเมนูซ้ำอีกช่อง
      { href: "/projects", label: "งานที่มอบหมาย" }
    ]
  },
  {
    key: "routine",
    label: "เช็คลิสต์และตาราง",
    links: [
      { href: "/checklist", label: "เช็คลิสต์" },
      { href: "/supplies", label: "ของที่ต้องสั่ง" },
      { href: "/schedule", label: "ตารางกะ" },
      { href: "/training", label: "คู่มืองาน" }
    ]
  }
];

/** ลิงก์เดี่ยวของแอดมิน — หน้ารวมงานจัดการเป็นทางเข้าหลัก ไม่ต้องซ่อนในกลุ่ม */
export const adminQuickLinks: NavLink[] = [{ href: "/admin", label: "หน้ารวมงานจัดการ", exact: true }];

export const adminGroups: NavGroup[] = [
  {
    key: "assign",
    label: "ตารางและการมอบหมายงาน",
    links: [
      { href: "/admin/schedule", label: "ตารางกะ" },
      { href: "/admin/assign", label: "มอบหมายงานรายวัน (แบบเดิม)" },
      { href: "/admin/projects", label: "มอบหมายงานเดี่ยว/กลุ่ม" },
      { href: "/admin/tasks", label: "สั่งงานประจำ" },
      { href: "/admin/calendar", label: "ปฏิทินสั่งงาน" }
    ]
  },
  {
    key: "staff",
    label: "พนักงาน",
    links: [
      { href: "/admin/staff-view", label: "มุมมองพนักงาน" },
      { href: "/admin/staff", label: "จัดการพนักงาน" }
    ]
  },
  {
    key: "config",
    label: "ตั้งค่างาน",
    links: [
      { href: "/admin/checklist-config", label: "ปรับ Checklist" },
      { href: "/admin/manual-config", label: "แก้คู่มืองาน" }
    ]
  },
  {
    key: "kpi",
    label: "Stock / KPI",
    links: [
      { href: "/admin/stock-check", label: "ลงคะแนน Stock" },
      { href: "/admin/checklist-audit", label: "สุ่มตรวจ Checklist" },
      { href: "/admin/performance-score", label: "คะแนนพนักงาน" },
      { href: "/admin/kpi-rules", label: "เกณฑ์ให้คะแนน" }
    ]
  },
  {
    key: "review",
    label: "ตรวจและสรุป",
    links: [
      { href: "/manager-review", label: "ตรวจงาน" },
      { href: "/admin/ops", label: "สรุปทั้งร้าน รายคน" },
      { href: "/monthly-summary", label: "สรุปรายเดือน" }
    ]
  }
];

/** กลุ่มไหนคือกลุ่มของหน้าที่เปิดอยู่ — ใช้เปิดกลุ่มนั้นค้างไว้ให้รู้ว่าตัวเองอยู่ตรงไหน */
export function groupOfPath(groups: NavGroup[], pathname: string): string | null {
  let best: { key: string; length: number } | null = null;
  for (const group of groups) {
    for (const link of group.links) {
      if (pathname === link.href || pathname.startsWith(`${link.href}/`)) {
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
