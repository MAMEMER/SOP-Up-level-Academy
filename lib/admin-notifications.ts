// ศูนย์รวมแจ้งเตือนของเจ้าของร้าน — รวมทุกเรื่องที่ต้องดูจากทุกหน้ามาไว้ที่ Admin Hub
// ที่เดียว. เดิมต้องไล่เปิดทีละหน้าถึงจะรู้ว่ามีอะไรค้าง (ตรวจงาน, ส่งของ, งานส่งต่อ,
// checklist, การกดส่งที่ไม่ถึงระบบ) — เรื่องที่ไม่มีใครเปิดหน้านั้นก็ไม่มีใครเห็น.
//
// โมดูลนี้ pure: รับข้อมูลที่อ่านมาแล้วจากแต่ละแหล่ง แล้วตัดสินว่าอะไรควรเตือน ระดับไหน
// เรียงยังไง (ตัวอ่าน Firestore อยู่ใน lib/admin-notifications-server.ts)

/**
 * urgent  = กระทบลูกค้าหรือเงินถ้าปล่อยไว้ข้ามวัน
 * warning = ต้องตามวันนี้ แต่ยังไม่เสียหาย
 * info    = รู้ไว้ ไม่ต้องรีบ
 */
export type NotificationLevel = "urgent" | "warning" | "info";

export type AdminNotification = {
  id: string;
  level: NotificationLevel;
  /** หมวดต้นทาง เช่น "งานส่งของ" — ให้กวาดตาเห็นว่ามาจากไหนโดยไม่ต้องอ่านทั้งบรรทัด */
  source: string;
  title: string;
  detail?: string;
  href: string;
  /** จำนวนรายการที่รวมอยู่ในแจ้งเตือนนี้ */
  count?: number;
};

const levelOrder: Record<NotificationLevel, number> = { urgent: 0, warning: 1, info: 2 };

export const levelLabels: Record<NotificationLevel, string> = {
  urgent: "ด่วน",
  warning: "ต้องตาม",
  info: "รู้ไว้"
};

/** ด่วนก่อน แล้วเรียงตามจำนวนมากไปน้อยในระดับเดียวกัน */
export function sortNotifications(items: AdminNotification[]): AdminNotification[] {
  return [...items].sort((left, right) => {
    const byLevel = levelOrder[left.level] - levelOrder[right.level];
    if (byLevel !== 0) return byLevel;
    const byCount = (right.count ?? 0) - (left.count ?? 0);
    if (byCount !== 0) return byCount;
    return left.title.localeCompare(right.title, "th");
  });
}

export type NotificationSummary = {
  total: number;
  urgent: number;
  warning: number;
};

export function summariseNotifications(items: AdminNotification[]): NotificationSummary {
  return {
    total: items.length,
    urgent: items.filter((item) => item.level === "urgent").length,
    warning: items.filter((item) => item.level === "warning").length
  };
}

/** บรรทัดสรุปใต้หัวข้อ: "ด่วน 2 · ต้องตาม 3" */
export function notificationHeadline(summary: NotificationSummary): string {
  if (summary.total === 0) return "ไม่มีเรื่องค้าง";
  const parts: string[] = [];
  if (summary.urgent) parts.push(`ด่วน ${summary.urgent}`);
  if (summary.warning) parts.push(`ต้องตาม ${summary.warning}`);
  return parts.length ? parts.join(" · ") : `${summary.total} เรื่อง`;
}

/**
 * สิ่งที่แต่ละแหล่งต้องนับมาให้ — ตั้งใจให้เป็นตัวเลข/ชื่อล้วน ไม่ผูกกับรูปร่างข้อมูลของ
 * แหล่งไหนเลย ฝั่ง server จะเปลี่ยนวิธีอ่านยังไงก็ไม่กระทบกติกาการเตือนตรงนี้
 */
export type NotificationInput = {
  /** false = อ่าน/เขียน record ไม่ได้ ตัวเลขทุกตัวบนหน้าเชื่อไม่ได้ */
  storageReady: boolean;
  /** ออเดอร์ส่งของ (delivery_tasks) */
  deliveries: { overdue: number; unshipped: number; unclaimed: number };
  /** กดส่ง checklist แล้วไม่มีข้อมูลในระบบ — ระบบพลาด ต้องรีบดู */
  pressesWithoutRecord: Array<{ staffName: string; phaseTitle: string }>;
  /** งานที่มอบหมาย (work_assignments) */
  assignments: { waitingReview: number; overdue: number };
  /** งานส่งต่อที่ยังไม่มีคนรับ */
  handoffs: { open: number };
  /** checklist ของวันนี้ */
  checklist: { latePhases: number; notStartedStaff: string[] };
  /** แจ้งบัค / ข้อเสนอแนะที่ยังไม่ได้อ่าน */
  bugReports: { open: number };
  /**
   * งานที่ค้างอยู่ในเว็บกิลด์ (guild.uplevelguild.com) — คนละระบบกับ SOP แต่เจ้าของร้าน
   * คนเดียวกันต้องอนุมัติ. เดิมต้องเปิดเว็บกิลด์แยกถึงจะเห็นว่ามีอะไรรอ — พลาดง่ายมาก.
   * ทุกตัวเป็น "จำนวนรายการที่ยังรออนุมัติ/รอดำเนินการ" ล้วน.
   */
  guild: {
    /** activity_claims (status == pending) — ขอเพิ่ม EXP */
    expClaims: number;
    /** quest_submissions (status == pending) — เควสรอตรวจ */
    questSubmissions: number;
    /** shop_requests (status == pending) — คำขอแลกของ */
    shopRequests: number;
    /** coin_topups (status == pending_manual) — เติมเหรียญรอยืนยัน */
    coinTopups: number;
    /** merge_requests (status == pending) — คำขอรวมบัญชี */
    mergeRequests: number;
    /** shop_orders (status in [pending, processing]) — ออเดอร์ร้านค้าในเว็บกิลด์ */
    guildShopOrders: number;
    /** users (status == pending_manual) — สมาชิกใหม่รอ approve */
    pendingMembers: number;
  };
};

/** เว็บกิลด์อยู่คนละโดเมน — กดจากแจ้งเตือนต้องพาไปหน้าอนุมัติของกิลด์โดยตรง */
const GUILD_ADMIN_HREF = "https://guild.uplevelguild.com/admin";

/**
 * หนึ่งบรรทัดต่อหนึ่งหมวดของเว็บกิลด์. เรียงตามความสำคัญคร่าวๆ (เงิน/สมาชิกก่อน) แต่
 * ระดับเป็น warning เท่ากันหมด — การเรียงจริงทำที่ sortNotifications ตามจำนวน.
 */
const GUILD_ROWS: Array<{ key: keyof NotificationInput["guild"]; id: string; label: string }> = [
  { key: "expClaims", id: "guild-exp-claims", label: "ขอเพิ่ม EXP รออนุมัติ" },
  { key: "questSubmissions", id: "guild-quest-submissions", label: "เควสรอตรวจ" },
  { key: "shopRequests", id: "guild-shop-requests", label: "คำขอแลกของรออนุมัติ" },
  { key: "coinTopups", id: "guild-coin-topups", label: "เติมเหรียญรอยืนยัน" },
  { key: "mergeRequests", id: "guild-merge-requests", label: "คำขอรวมบัญชี" },
  { key: "guildShopOrders", id: "guild-shop-orders", label: "ออเดอร์ร้านค้ารอดำเนินการ" },
  { key: "pendingMembers", id: "guild-pending-members", label: "สมาชิกใหม่รอ approve" }
];

export function buildAdminNotifications(input: NotificationInput): AdminNotification[] {
  const items: AdminNotification[] = [];

  // ── ตัวเลขบนหน้าเชื่อไม่ได้ ต้องบอกก่อนเรื่องอื่น ────────────────────────
  if (!input.storageReady) {
    items.push({
      id: "storage-down",
      level: "urgent",
      source: "ระบบ",
      title: "อ่านข้อมูลงานไม่ได้",
      detail: "ตัวเลขทั้งหน้าตอนนี้เชื่อไม่ได้ — ยังไม่ต้องตัดสินอะไรจากหน้านี้",
      href: "/admin/ops"
    });
  }

  // ── ลูกค้ารออยู่ ────────────────────────────────────────────────────────
  if (input.deliveries.overdue > 0) {
    items.push({
      id: "delivery-overdue",
      level: "urgent",
      source: "งานส่งของ",
      title: `ออเดอร์เลยกำหนดส่ง ${input.deliveries.overdue} ใบ`,
      detail: "ลูกค้าจ่ายเงินแล้วและเลยกรอบ 1 วัน",
      href: "/#delivery-orders",
      count: input.deliveries.overdue
    });
  } else if (input.deliveries.unshipped > 0) {
    items.push({
      id: "delivery-open",
      level: "warning",
      source: "งานส่งของ",
      title: `ออเดอร์รอส่ง ${input.deliveries.unshipped} ใบ`,
      detail: input.deliveries.unclaimed ? `ยังไม่มีคนรับงาน ${input.deliveries.unclaimed} ใบ` : undefined,
      href: "/#delivery-orders",
      count: input.deliveries.unshipped
    });
  }

  // ── ระบบพลาด ต้องแยกออกจาก "พนักงานไม่ทำ" ให้ชัด ────────────────────────
  if (input.pressesWithoutRecord.length) {
    const who = [...new Set(input.pressesWithoutRecord.map((entry) => entry.staffName))].join(", ");
    items.push({
      id: "submit-lost",
      level: "urgent",
      source: "Checklist",
      title: `กดส่งงานแล้วไม่มีข้อมูลในระบบ ${input.pressesWithoutRecord.length} รอบ`,
      detail: `${who} — ตรวจก่อนตัดสินว่าไม่ได้ทำ`,
      href: "/manager-review",
      count: input.pressesWithoutRecord.length
    });
  }

  // ── งานที่มอบหมาย ───────────────────────────────────────────────────────
  if (input.assignments.overdue > 0) {
    items.push({
      id: "assignment-overdue",
      level: "urgent",
      source: "งานที่มอบหมาย",
      title: `เลยกำหนดแล้วยังไม่ส่ง ${input.assignments.overdue} งาน`,
      href: "/admin/assign",
      count: input.assignments.overdue
    });
  }
  if (input.assignments.waitingReview > 0) {
    items.push({
      id: "assignment-review",
      level: "warning",
      source: "งานที่มอบหมาย",
      title: `รอเจ้าของร้านตรวจ ${input.assignments.waitingReview} งาน`,
      detail: "พนักงานส่งแล้ว รอรับงาน",
      href: "/manager-review",
      count: input.assignments.waitingReview
    });
  }

  // ── checklist วันนี้ ────────────────────────────────────────────────────
  if (input.checklist.latePhases > 0) {
    items.push({
      id: "checklist-late",
      level: "warning",
      source: "Checklist",
      title: `หัวข้อเลยกำหนดวันนี้ ${input.checklist.latePhases} หัวข้อ`,
      href: "/admin/ops",
      count: input.checklist.latePhases
    });
  }
  if (input.checklist.notStartedStaff.length) {
    items.push({
      id: "checklist-not-started",
      level: "warning",
      source: "Checklist",
      title: `ยังไม่เริ่ม checklist ${input.checklist.notStartedStaff.length} คน`,
      detail: input.checklist.notStartedStaff.join(" · "),
      href: "/admin/ops",
      count: input.checklist.notStartedStaff.length
    });
  }

  // ── งานส่งต่อ ───────────────────────────────────────────────────────────
  if (input.handoffs.open > 0) {
    items.push({
      id: "handoff-open",
      level: "info",
      source: "งานส่งต่อ",
      title: `งานส่งต่อยังไม่มีคนรับ ${input.handoffs.open} งาน`,
      href: "/handoff",
      count: input.handoffs.open
    });
  }

  if (input.bugReports.open > 0) {
    items.push({
      id: "bug-reports",
      level: "info",
      source: "แจ้งบัค",
      title: `เรื่องที่พนักงานแจ้งมา ${input.bugReports.open} เรื่อง`,
      href: "/admin/ops",
      count: input.bugReports.open
    });
  }

  // ── เว็บกิลด์ — หนึ่งบรรทัดต่อหมวดที่มีของค้างเท่านั้น ──────────────────────
  for (const row of GUILD_ROWS) {
    const count = input.guild[row.key];
    if (count > 0) {
      items.push({
        id: row.id,
        level: "warning",
        source: "เว็บกิลด์",
        title: `${row.label} ${count}`,
        href: GUILD_ADMIN_HREF,
        count
      });
    }
  }

  return sortNotifications(items);
}
