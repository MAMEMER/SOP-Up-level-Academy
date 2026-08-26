// แจ้งเตือนของพนักงาน — รวมทุกอย่างที่ "ต้องรู้" ไว้ที่เดียว
//
// เดิมเรื่องที่ต้องรู้กระจายอยู่คนละหน้า: งานที่มอบหมายอยู่หน้าหนึ่ง งานส่งของอีกหน้า
// คำแนะนำหัวหน้ากับเสียงลูกค้าอยู่ในหน้าผลงาน — พนักงานต้องไล่เปิดเองถึงจะเจอ. ไฟล์นี้รวม
// ทุกแหล่งให้เป็นรายการเดียว เรียงตามเวลา แล้วบอกว่าอันไหน "ยังไม่ได้อ่าน" โดยเทียบกับเวลา
// ที่คนนั้นเปิดหน้าแจ้งเตือนครั้งล่าสุด (sop_notification_reads/<staffCode>.lastSeenAt).
//
// จงใจ **derive จากข้อมูลที่มีอยู่แล้ว** ไม่สร้างคอลเลกชันแจ้งเตือนคู่ขนาน: ไม่มีปัญหา
// แจ้งเตือนค้างเมื่องานถูกลบ/แก้ และไม่ต้องเขียน Firestore ทุกครั้งที่มีเหตุการณ์.
//
// pure logic ล้วน — ตัวอ่านจริงอยู่ที่ /api/notifications.

export type NotificationKind = "assigned_work" | "handover" | "delivery" | "coaching" | "feedback" | "revision";

export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  assigned_work: "งานที่มอบหมาย",
  handover: "งานส่งต่อ",
  delivery: "งานส่งของ",
  coaching: "คำแนะนำจากหัวหน้า",
  feedback: "เสียงจากลูกค้า",
  revision: "งานที่ต้องแก้"
};

export const NOTIFICATION_KIND_CLASS: Record<NotificationKind, string> = {
  assigned_work: "is-work",
  handover: "is-handover",
  delivery: "is-delivery",
  coaching: "is-coaching",
  feedback: "is-feedback",
  revision: "is-revision"
};

export type StaffNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  detail?: string;
  /** เวลาเกิดเหตุ (ISO) — ใช้เรียงและตัดว่าอ่านหรือยัง */
  at: string;
  href: string;
  unread: boolean;
};

/** เก็บแค่ 60 รายการล่าสุด — หน้าแจ้งเตือนไม่ใช่ที่เก็บประวัติทั้งชีวิต */
export const MAX_NOTIFICATIONS = 60;

export const NOTIFICATION_READS_COLLECTION = "sop_notification_reads";

type Input = {
  /** งานที่มอบหมายรายวัน (work_assignments) ของคนนี้ */
  assignments: Array<{ id: string; title: string; status: string; workDate: string; createdAt: string; revisionNote?: string; reviewedAt?: string }>;
  /** งานแบบโปรเจกต์ (work_projects) ที่คนนี้เกี่ยวข้อง */
  projects: Array<{
    id: string;
    title: string;
    createdAt: string;
    status?: string;
    assignees: string[];
    handovers?: Array<{ id: string; to: string; from: string; at: string; note?: string }>;
  }>;
  /** งานส่งของที่ยังไม่ปิด (delivery_tasks) ของกะนี้ */
  deliveries: Array<{ id: string; title: string; at: string; status: string }>;
  /** คำแนะนำจากหัวหน้า (sop_coaching_notes) */
  coaching: Array<{ id: string; note: string; createdAt: string; acknowledgedAt?: string }>;
  /** เสียงจากลูกค้าที่ถูกปล่อยให้เห็นแล้ว (staff_feedback) */
  feedback: Array<{ id: string; kind: string; message: string; createdAt: string }>;
  staffCode: string;
  /** เวลาที่เปิดหน้าแจ้งเตือนครั้งล่าสุด (ISO) — ไม่มี = ยังไม่เคยเปิด ทุกอย่างนับว่ายังไม่อ่าน */
  lastSeenAt?: string;
};

function clip(text: string, max = 90): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

const FEEDBACK_TITLE: Record<string, string> = {
  praise: "ลูกค้าชมคุณ",
  suggestion: "ลูกค้าฝากคำแนะนำ",
  complaint: "ลูกค้าติเรื่องบริการ"
};

/**
 * รวมทุกแหล่งเป็นรายการแจ้งเตือนเดียว เรียงใหม่สุดก่อน.
 * "ยังไม่อ่าน" = เกิดหลังเวลาที่เปิดหน้าแจ้งเตือนครั้งล่าสุด (คำแนะนำหัวหน้าที่ยังไม่กด
 * "รับทราบ" ถือว่ายังไม่อ่านเสมอ เพราะมันต้องการการตอบรับ ไม่ใช่แค่เห็นผ่านตา).
 */
export function buildStaffNotifications(input: Input): StaffNotification[] {
  const items: StaffNotification[] = [];
  const seen = input.lastSeenAt || "";
  const isUnread = (at: string) => !seen || at > seen;

  for (const assignment of input.assignments) {
    if (assignment.status === "needs_revision") {
      const at = assignment.reviewedAt || assignment.createdAt;
      items.push({
        id: `rev-${assignment.id}`,
        kind: "revision",
        title: `ต้องแก้งาน: ${assignment.title}`,
        detail: assignment.revisionNote ? clip(assignment.revisionNote) : undefined,
        at,
        href: `/assigned-work/task/${encodeURIComponent(assignment.id)}`,
        unread: isUnread(at)
      });
      continue;
    }
    if (assignment.status === "open") {
      items.push({
        id: `wa-${assignment.id}`,
        kind: "assigned_work",
        title: `งานใหม่: ${assignment.title}`,
        detail: `กำหนด ${assignment.workDate}`,
        at: assignment.createdAt,
        href: `/assigned-work/task/${encodeURIComponent(assignment.id)}`,
        unread: isUnread(assignment.createdAt)
      });
    }
  }

  for (const project of input.projects) {
    // งานที่ปิด/ยกเลิกแล้วไม่ต้องเตือนอีก — แจ้งเตือนคือ "สิ่งที่ยังต้องทำ" ไม่ใช่ประวัติ
    if (project.status && project.status !== "active") continue;
    if (project.assignees.includes(input.staffCode)) {
      items.push({
        id: `wp-${project.id}`,
        kind: "assigned_work",
        title: `งานที่มอบหมาย: ${project.title}`,
        at: project.createdAt,
        href: "/projects",
        unread: isUnread(project.createdAt)
      });
    }
    for (const handover of project.handovers || []) {
      if (handover.to !== input.staffCode) continue;
      items.push({
        id: `ho-${handover.id}`,
        kind: "handover",
        title: `รับงานต่อ: ${project.title}`,
        detail: handover.note ? clip(handover.note) : undefined,
        at: handover.at,
        href: "/projects",
        unread: isUnread(handover.at)
      });
    }
  }

  for (const delivery of input.deliveries) {
    if (delivery.status === "shipped") continue;
    items.push({
      id: `dl-${delivery.id}`,
      kind: "delivery",
      title: `งานส่งของ: ${delivery.title}`,
      at: delivery.at,
      href: "/",
      unread: isUnread(delivery.at)
    });
  }

  for (const note of input.coaching) {
    items.push({
      id: `cn-${note.id}`,
      kind: "coaching",
      title: "หัวหน้าส่งคำแนะนำถึงคุณ",
      detail: clip(note.note),
      at: note.createdAt,
      // ยังไม่กดรับทราบ = ยังไม่อ่าน ไม่ว่าจะเปิดหน้าแจ้งเตือนไปแล้วกี่รอบ
      href: "/my-review",
      unread: !note.acknowledgedAt || isUnread(note.createdAt)
    });
  }

  for (const item of input.feedback) {
    items.push({
      id: `sf-${item.id}`,
      kind: "feedback",
      title: FEEDBACK_TITLE[item.kind] || "เสียงจากลูกค้า",
      detail: clip(item.message),
      at: item.createdAt,
      href: "/my-review",
      unread: isUnread(item.createdAt)
    });
  }

  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX_NOTIFICATIONS);
}

export function unreadCount(items: StaffNotification[]): number {
  return items.filter((item) => item.unread).length;
}

/** จำนวนที่ยังไม่อ่านแยกตามหมวด — ใช้ทำแถบสรุปบนหน้าแจ้งเตือน */
export function unreadByKind(items: StaffNotification[]): Array<{ kind: NotificationKind; count: number }> {
  const counts = new Map<NotificationKind, number>();
  for (const item of items) {
    if (!item.unread) continue;
    counts.set(item.kind, (counts.get(item.kind) || 0) + 1);
  }
  return [...counts.entries()].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count);
}

export function notificationTimeLabel(iso: string, now = new Date()): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "";
  const minutes = Math.round((now.getTime() - parsed) / 60000);
  if (minutes < 1) return "เมื่อกี้";
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} ชั่วโมงที่แล้ว`;
  if (minutes < 60 * 24 * 7) return `${Math.floor(minutes / (60 * 24))} วันที่แล้ว`;
  return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" }).format(new Date(parsed));
}
