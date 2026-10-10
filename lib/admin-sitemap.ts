// สารบัญหน้าฝั่งเจ้าของ/แอดมิน — ที่เดียวที่บอกว่า "หน้าไหนอยู่หมวดไหน".
//
// เดิมเมนูบน (nav-links) กับการ์ดในหน้ารวมงานจัดการ (/admin) เขียนแยกกันสองชุด → หน้าใหม่
// มักโผล่แค่ที่เดียว (ตารางกิจกรรม/ของหาย/เป้าดอกไม้/ตรวจนับ Stock ไม่อยู่ในเมนูเลย) และชื่อหมวด
// ไม่ตรงกัน เจ้าของเลยหาไม่เจอว่าอะไรอยู่ไหน (แชมป์ 4 ต.ค. 2026). ตอนนี้ทั้งสองที่อ่านจากไฟล์นี้
// และมี test บังคับว่าทุกหน้าใต้ /admin ต้องอยู่ในสารบัญ.
//
// จัดหมวดตาม "มาทำอะไร" ไม่ใช่ตามระบบหลังบ้าน.

export type SiteLink = {
  href: string;
  label: string;
  /** หนึ่งบรรทัด: กดแล้วได้อะไร */
  detail: string;
  /** เห็นเฉพาะเจ้าของ (isOwner) */
  ownerOnly?: boolean;
  /** เห็นเฉพาะคนที่เปิด/ปิดสิทธิ์เข้าระบบได้ (canManageStaffAccounts) */
  staffAdminOnly?: boolean;
  /** คำค้นเพิ่ม — ให้ช่องค้นหาเจอแม้พิมพ์คนละคำ */
  keywords?: string;
};

export type SiteSection = { key: string; label: string; hint: string; links: SiteLink[] };

export const ADMIN_HOME: SiteLink = {
  href: "/admin",
  label: "หน้าหลักเจ้าของ",
  detail: "เรื่องที่ต้องตามวันนี้ + ทุกเมนูในที่เดียว"
};

export const adminSections: SiteSection[] = [
  {
    key: "today",
    label: "วันนี้",
    hint: "เปิดดูทุกวัน",
    links: [
      { href: "/admin/ops", label: "ดูงานรายคน", detail: "ใครทำอะไรไปแล้ว งานค้าง ปัญหาที่ต้องตาม แยกสาขา", keywords: "สรุปทั้งร้าน ops" },
      { href: "/admin/task-review", label: "ตรวจงานที่มอบหมาย", detail: "แยกสาขา · ทีม · พนักงาน → แฟ้มรายเดือน · คอมเมนต์ + ให้คะแนน", keywords: "แฟ้มงาน ตรวจ คะแนน" },
      { href: "/manager-review", label: "ตรวจงานที่ส่งมา", detail: "งานที่พนักงานกดส่งตรวจ พร้อมรูป/หลักฐาน", keywords: "รีวิว review" },
      { href: "/admin/closing", label: "ปิดยอด 2 สาขา", detail: "เงินสดแต่ละสาขา · K SHOP รวมเทียบยอดธนาคาร", keywords: "เงิน ยอดขาย kshop" }
    ]
  },
  {
    key: "plan",
    label: "ตาราง",
    hint: "ใครอยู่ไหน จัดอะไร",
    links: [
      { href: "/admin/schedule", label: "ตารางกะ", detail: "วางกะรายเดือนทั้ง 2 สาขา · เทียบเวลาเข้างานจริง", keywords: "กะ เข้างาน ลา" },
      {
        href: "/admin/activities",
        label: "ตารางกิจกรรม 2 สาขา",
        detail: "วันไหนจัดเกมอะไร สาขาไหน + ใครเข้ากะ",
        ownerOnly: true,
        keywords: "event weekly ทัวร์ pokemon lorcana"
      },
      { href: "/admin/calendar", label: "ปฏิทินสั่งงาน", detail: "ทั้งเดือน วันไหนมีงาน/กิจกรรมอะไร กดวันแล้วสั่งงานได้", keywords: "calendar" },
      {
        href: "/card-prices/events",
        label: "งานแข่งร้านอื่น",
        detail: "งานที่ร้านอื่นประกาศในกลุ่ม FB · ค่าสมัคร ที่นั่ง รางวัล · วันไหนชนกับงานเรา",
        keywords: "คู่แข่ง competitor ทัวร์ event pokemon lorcana riftbound fb"
      }
    ]
  },
  {
    key: "assign",
    label: "สั่งงาน",
    hint: "ให้พนักงานทำ",
    links: [
      { href: "/admin/tasks", label: "งานประจำ", detail: "งานรายวัน/สัปดาห์/เดือน ลงวันไหน กะไหน ส่งแบบไหน", keywords: "daily weekly monthly routine" },
      { href: "/admin/projects", label: "มอบหมายงานเดี่ยว/กลุ่ม", detail: "งานวันเดียวหรือหลายวัน ใครทำ ดูความคืบหน้าเป็น %", keywords: "โปรเจกต์ project" },
      { href: "/admin/stock-runs", label: "สั่งตรวจนับ Stock", detail: "มอบหมาย + ตรวจรับการนับ อุปกรณ์/Sleeve และ Single card", keywords: "นับของ สต็อก" },
      { href: "/admin/assign", label: "มอบหมายงานรายวัน (แบบเดิม)", detail: "ระบบเก่าที่ผูก KPI — งานใหม่ใช้ 'มอบหมายงานเดี่ยว/กลุ่ม'", keywords: "assign" }
    ]
  },
  {
    key: "score",
    label: "คะแนน & เงิน",
    hint: "KPI หักเงิน ของหาย",
    links: [
      { href: "/admin/performance-score", label: "คะแนนพนักงาน", detail: "KPI 5 หมวด · incentive · เหตุผลที่หักรายวัน", keywords: "kpi เงินเดือน" },
      { href: "/admin/stock-check", label: "ลงผลนับ Stock", detail: "ผลนับของวันนั้น ตรง / ไม่ตรง / ไม่ได้นับ (มีผลกับคะแนน)", keywords: "สต็อก" },
      { href: "/admin/checklist-audit", label: "สุ่มตรวจ Checklist", detail: "ติ๊กว่าทำแต่ไม่ได้ทำ — หัก 10 คะแนน + ธง coach", keywords: "audit" },
      { href: "/admin/stock-loss", label: "ของหาย น้ำ/ขนม", detail: "มูลค่าของที่หายรายรอบ · จุดที่ควรตาม", ownerOnly: true, keywords: "สต็อกหาย loss" },
      { href: "/admin/line-bot", label: "ผู้ช่วยไลน์ (บอท)", detail: "บอทตอบอะไรไปบ้าง ตอบเร็วแค่ไหน · เตือนแล้วส่งทันไหม", ownerOnly: true, keywords: "line ไลน์ bot golden baby เตือน" },
      { href: "/admin/flower-target", label: "เป้าดอกไม้", detail: "เป้าดอกไม้แต่ละคน · รางวัล · อันดับเดือนนี้", ownerOnly: true, keywords: "ทิป flower" },
      { href: "/monthly-summary", label: "สรุปรายเดือน", detail: "งานที่ส่งตรวจทั้งเดือน + ความครบของ checklist", keywords: "monthly" },
      { href: "/admin/kpi-rules", label: "กติกาให้คะแนน", detail: "ดูวิธีบวก/หักคะแนนทั้งหมด · เจ้าของปรับเรตได้", keywords: "เกณฑ์ kpi" }
    ]
  },
  {
    key: "people",
    label: "พนักงาน",
    hint: "บัญชี เอกสาร",
    links: [
      { href: "/admin/staff", label: "จัดการพนักงาน", detail: "เพิ่ม/แก้/ปิดบัญชี · อีเมล login · รหัส · ชื่อใน StoreHub", staffAdminOnly: true, keywords: "บัญชี account" },
      { href: "/admin/staff-documents", label: "เอกสารพนักงาน", detail: "ประกันสังคม + บัญชีเงินเดือน ใครส่งแล้วบ้าง", keywords: "ประกันสังคม" },
      { href: "/admin/staff-view", label: "ดูในมุมมองพนักงาน", detail: "เปิดเว็บแบบที่พนักงานคนนั้นเห็น (ดูอย่างเดียว)", keywords: "impersonate view as" }
    ]
  },
  {
    key: "setup",
    label: "ตั้งค่า",
    hint: "นานๆ แก้ที",
    links: [
      { href: "/admin/checklist-config", label: "แก้ Checklist", detail: "รายการ Daily / Weekly / Monthly · เวลาส่ง · ลำดับ · กะ", keywords: "เช็คลิสต์" },
      { href: "/admin/manual-config", label: "แก้คู่มืองาน", detail: "ขั้นตอน วัตถุประสงค์ ข้อควรระวัง ที่พนักงานอ่าน", keywords: "sop manual" }
    ]
  }
];

/** หน้าที่พนักงานใช้ — เจ้าของเปิดดูได้ แต่รวมไว้หมวดเดียว ไม่ปนกับเมนูจัดการ */
export const staffPagesSection: SiteSection = {
  key: "staff-pages",
  label: "หน้าพนักงาน",
  hint: "หน้าที่พนักงานใช้ทุกวัน",
  links: [
    { href: "/", label: "หน้าหลักพนักงาน", detail: "หน้าแรกที่พนักงานเห็นตอนเข้ากะ" },
    { href: "/tasks", label: "งานวันนี้", detail: "งานประจำที่ขึ้นวันนี้" },
    { href: "/checklist", label: "เช็คลิสต์", detail: "เช็คลิสต์เปิด-ปิดร้านรายวัน" },
    { href: "/closing", label: "ปิดยอด (พนักงาน)", detail: "หน้าที่พนักงานกรอกยอดปิดร้าน" },
    { href: "/parcels", label: "พัสดุการ์ด", detail: "รับพัสดุ + วิดีโอแกะกล่อง" },
    { href: "/supplies", label: "ของที่ต้องสั่ง", detail: "รายการของใกล้หมดจาก StoreHub" },
    { href: "/card-prices", label: "ราคากลางการ์ด + สเกาต์", detail: "ราคาจากกลุ่มซื้อขาย FB · ทักท้วง · ตั้งจับตาการ์ด", keywords: "ราคา การ์ด scout สเกาต์ fb pokemon lorcana riftbound" },
    { href: "/schedule", label: "ตารางกะ (พนักงาน)", detail: "ตารางกะแบบที่พนักงานเห็น" },
    { href: "/my-tasks", label: "แจ้งเตือนงาน", detail: "งานที่มอบหมายที่น้องยังไม่ได้ส่ง" },
    { href: "/my-tasks/file", label: "แฟ้มงาน", detail: "งานของน้องแยกเดือน เขียว/แดง" },
    { href: "/training", label: "คู่มืองาน", detail: "คู่มือที่พนักงานอ่าน" },
    { href: "/flowers", label: "ดอกไม้", detail: "สวนดอกไม้ของทีม" }
  ]
};

export type SiteViewer = { owner: boolean; staffAdmin: boolean };

export function visibleLink(link: SiteLink, viewer: SiteViewer): boolean {
  if (link.ownerOnly && !viewer.owner) return false;
  if (link.staffAdminOnly && !viewer.staffAdmin) return false;
  return true;
}

/** หมวดของแอดมิน ตัดหน้าที่คนนี้ไม่มีสิทธิ์ออก (หมวดว่างก็ตัดทิ้ง) */
export function adminSectionsFor(viewer: SiteViewer): SiteSection[] {
  return adminSections
    .map((section) => ({ ...section, links: section.links.filter((link) => visibleLink(link, viewer)) }))
    .filter((section) => section.links.length > 0);
}
