// งานแบบ "โปรเจกต์" — งานที่กินเวลาหลายวัน ไม่ใช่งานวันเดียวเหมือน work_assignments.
//
// เจ้าของสั่งงานเป็นช่วงเวลา: ตั้งแต่วันที่ … ถึงวันที่ … รวมกี่วัน ใครทำบ้าง แล้วคนทำ "ส่งงานเป็น
// progress ของแต่ละวัน" แทนการส่งครั้งเดียวจบ — เพิ่ม progress ตอนไหนก็ได้ (เผื่อทำนอกเวลา) แต่
// อย่างน้อยวันละครั้งเพื่อย้ำให้ทำสม่ำเสมอ. ระบบคิดให้ว่าตอนนี้กี่ % แล้ว ควรถึงกี่ % ตามเวลาที่
// ผ่านไป และเหลือวันละกี่ % ถึงจะทัน. เจ้าของยืด/ลดวัน หรือเพิ่มคนช่วยได้ตลอด.
//
// ไฟล์นี้เป็น pure logic ล้วน (คำนวณ + ตรวจความถูกต้อง) — ไม่แตะ network ให้ test ได้ตรงๆ.
// เอกสารจริงอยู่ใน Firestore `sop_work_projects` เขียนผ่าน /api/work-projects เท่านั้น.

export const WORK_PROJECTS_COLLECTION = "sop_work_projects";

export type ProjectStatus = "active" | "done" | "cancelled";

/** หนึ่งครั้งที่คนทำมาอัปเดตความคืบหน้า */
export type ProjectProgress = {
  id: string;
  /** วันทำงาน (YYYY-MM-DD) ที่ progress นี้นับเป็นของวันนั้น */
  date: string;
  /** เวลาจริงที่กดส่ง */
  at: string;
  /** staff code ของคนที่อัปเดต */
  by: string;
  /** ความคืบหน้ารวมของโปรเจกต์ ณ ตอนนั้น (0–100) */
  percent: number;
  /** วันนี้ทำอะไรไปบ้าง */
  note: string;
  images?: string[];
  link?: string;
};

/** ประวัติการปรับของเจ้าของ (ยืด/ลดวัน เพิ่ม/ลดคน) — ให้ย้อนดูได้ว่าทำไมแผนเปลี่ยน */
export type ProjectHistoryEntry = {
  at: string;
  by: string;
  action: "created" | "dates" | "assignees" | "status" | "detail";
  detail: string;
};

export type WorkProject = {
  id: string;
  branch: string;
  title: string;
  detail?: string;
  /** งานเสร็จหน้าตาเป็นยังไง */
  expectedResult?: string;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD (รวมวันนี้ด้วย) */
  endDate: string;
  /** staff codes ที่รับผิดชอบ */
  assignees: string[];
  status: ProjectStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  progress: ProjectProgress[];
  history?: ProjectHistoryEntry[];
};

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: "กำลังทำ",
  done: "เสร็จแล้ว",
  cancelled: "ยกเลิก"
};

/** จำนวน progress ที่เก็บต่อโปรเจกต์ (กันเอกสารบวมชน 1MiB ของ Firestore) */
export const MAX_PROJECT_PROGRESS = 400;

// ---- วันที่ ------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** วันที่ห่างกันกี่วัน (b - a) โดยยึดเที่ยงวันเวลาไทยกัน DST/timezone เพี้ยน */
export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00+07:00`).getTime();
  const b = new Date(`${to}T12:00:00+07:00`).getTime();
  return Math.round((b - a) / DAY_MS);
}

export function addDays(date: string, days: number): string {
  const at = new Date(`${date}T12:00:00+07:00`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** รวมกี่วัน — นับรวมวันเริ่มและวันสิ้นสุด (7–13 = 7 วัน) */
export function totalDays(startDate: string, endDate: string): number {
  return Math.max(1, daysBetween(startDate, endDate) + 1);
}

/** วันนี้เป็นวันที่เท่าไหร่ของโปรเจกต์ (1 = วันแรก) — ก่อนเริ่ม = 0, เลยกำหนด = totalDays */
export function dayIndex(project: Pick<WorkProject, "startDate" | "endDate">, today: string): number {
  const total = totalDays(project.startDate, project.endDate);
  const offset = daysBetween(project.startDate, today) + 1;
  return Math.max(0, Math.min(total, offset));
}

/** เหลืออีกกี่วัน (นับวันนี้ด้วย) — เลยกำหนดแล้วเป็น 0 */
export function daysLeft(project: Pick<WorkProject, "endDate">, today: string): number {
  return Math.max(0, daysBetween(today, project.endDate) + 1);
}

export function isOverdue(project: Pick<WorkProject, "endDate">, today: string): boolean {
  return daysBetween(today, project.endDate) < 0;
}

// ---- ความคืบหน้า --------------------------------------------------------------

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** เรียง progress ใหม่สุดขึ้นก่อน (วันเดียวกันดูเวลาที่กด) */
export function sortProgressNewestFirst(progress: ProjectProgress[]): ProjectProgress[] {
  return [...progress].sort((a, b) => (b.date === a.date ? b.at.localeCompare(a.at) : b.date.localeCompare(a.date)));
}

/** % ล่าสุดที่คนทำรายงานไว้ (ไม่มีเลย = 0) */
export function currentPercent(project: Pick<WorkProject, "progress" | "status">): number {
  if (project.status === "done") return 100;
  const latest = sortProgressNewestFirst(project.progress || [])[0];
  return latest ? clampPercent(latest.percent) : 0;
}

/** ควรจะถึงกี่ % แล้วถ้าเดินตามแผน (วันที่ผ่านไป ÷ วันทั้งหมด) */
export function expectedPercent(project: Pick<WorkProject, "startDate" | "endDate">, today: string): number {
  return clampPercent((dayIndex(project, today) / totalDays(project.startDate, project.endDate)) * 100);
}

export type ProjectPace = "not_started" | "ahead" | "on_track" | "behind" | "overdue" | "done";

export const PACE_LABEL: Record<ProjectPace, string> = {
  not_started: "ยังไม่ถึงวันเริ่ม",
  ahead: "เร็วกว่าแผน",
  on_track: "ตามแผน",
  behind: "ช้ากว่าแผน",
  overdue: "เลยกำหนดแล้ว",
  done: "เสร็จแล้ว"
};

/** สีป้ายสถานะ — ใช้ class เดียวกับ workflow status ทั้งเว็บ */
export const PACE_CLASS: Record<ProjectPace, string> = {
  not_started: "workflow-status-white",
  ahead: "workflow-status-green",
  on_track: "workflow-status-green",
  behind: "workflow-status-orange",
  overdue: "workflow-status-red",
  done: "workflow-status-green"
};

/** ช้าหรือเร็วกว่าแผนกี่ % ถึงจะเรียกว่า "ตามแผน" */
const PACE_TOLERANCE = 5;

export function paceOf(project: WorkProject, today: string): ProjectPace {
  if (project.status === "done") return "done";
  const percent = currentPercent(project);
  if (percent >= 100) return "done";
  if (daysBetween(project.startDate, today) < 0) return "not_started";
  if (isOverdue(project, today)) return "overdue";
  const gap = percent - expectedPercent(project, today);
  if (gap > PACE_TOLERANCE) return "ahead";
  if (gap < -PACE_TOLERANCE) return "behind";
  return "on_track";
}

/** ต้องทำวันละกี่ % ถึงจะเสร็จทัน (เหลือ 0 วัน = ต้องเก็บให้จบทั้งก้อน) */
export function dailyTargetPercent(project: WorkProject, today: string): number {
  const remaining = Math.max(0, 100 - currentPercent(project));
  const left = daysLeft(project, today);
  if (remaining === 0) return 0;
  if (left <= 0) return remaining;
  return Math.ceil(remaining / left);
}

export function progressOnDate(project: Pick<WorkProject, "progress">, date: string): ProjectProgress[] {
  return (project.progress || []).filter((entry) => entry.date === date);
}

/** วันนี้มีคนอัปเดตแล้วหรือยัง (ระบุ staffCode = เช็คเฉพาะของคนนั้น) */
export function hasProgressOn(project: Pick<WorkProject, "progress">, date: string, staffCode?: string): boolean {
  return progressOnDate(project, date).some((entry) => !staffCode || entry.by === staffCode);
}

/** ใครอัปเดตในวันนั้นบ้าง (ไม่ซ้ำ เรียงตามที่ลงก่อน-หลัง) */
export function progressAuthorsOn(project: Pick<WorkProject, "progress">, date: string): string[] {
  return Array.from(new Set(progressOnDate(project, date).map((entry) => entry.by)));
}

/** อัปเดตไปกี่ครั้งแล้ว — ทั้งโปรเจกต์ หรือเฉพาะวันที่ระบุ */
export function progressCount(project: Pick<WorkProject, "progress">, date?: string): number {
  return date ? progressOnDate(project, date).length : (project.progress || []).length;
}

/**
 * ทีมต้องลง progress ของวันนี้ไหม — เป้าหมายคือ **วันละอย่างน้อย 1 ครั้ง จากใครก็ได้ในทีม**
 * ไม่ใช่ทุกคนต้องลงของตัวเอง. มีคนลงแล้วถือว่าวันนี้ครบ (คนอื่นจะลงเพิ่มอีกกี่ครั้งก็ได้).
 * ยังเตือนต่อแม้เลยกำหนดแล้ว ตราบใดที่งานยังไม่ปิด — งานที่ค้างคือเรื่องที่ต้องรู้ยิ่งกว่าเดิม.
 */
export function teamNeedsProgressToday(project: WorkProject, today: string): boolean {
  if (project.status !== "active") return false;
  if (daysBetween(project.startDate, today) < 0) return false;
  return !hasProgressOn(project, today);
}

/** หนึ่งช่องของไทม์ไลน์รายวัน — ให้เห็นว่าวันไหนทำ วันไหนเงียบ */
export type ProjectDay = {
  date: string;
  /** วันที่เท่าไหร่ของโปรเจกต์ (1 = วันแรก) */
  index: number;
  entries: ProjectProgress[];
  /** % ที่รายงานไว้ล่าสุด ณ สิ้นวันนั้น */
  percent: number;
  isToday: boolean;
  isFuture: boolean;
  /** วันที่ผ่านไปแล้วแต่ไม่มีใครอัปเดตเลย */
  missed: boolean;
};

/** ไทม์ไลน์ทุกวันของโปรเจกต์ (จำกัดที่ 400 วันกันหลุด) */
export function projectDays(project: WorkProject, today: string): ProjectDay[] {
  const total = Math.min(totalDays(project.startDate, project.endDate), 400);
  const out: ProjectDay[] = [];
  let percent = 0;
  for (let index = 0; index < total; index += 1) {
    const date = addDays(project.startDate, index);
    const entries = sortProgressNewestFirst(progressOnDate(project, date)).reverse();
    if (entries.length) percent = clampPercent(entries[entries.length - 1].percent);
    const diff = daysBetween(today, date);
    out.push({
      date,
      index: index + 1,
      entries,
      percent,
      isToday: diff === 0,
      isFuture: diff > 0,
      missed: diff < 0 && entries.length === 0
    });
  }
  return out;
}

// ---- ตรวจความถูกต้องก่อนเขียน --------------------------------------------------

export type ProjectDraft = {
  title: string;
  detail?: string;
  expectedResult?: string;
  startDate: string;
  endDate: string;
  assignees: string[];
};

/** ข้อความ error ภาษาไทย หรือ null เมื่อผ่าน — ใช้ทั้งฝั่ง client และ server */
export function validateProjectDraft(draft: Partial<ProjectDraft>): string | null {
  if (!draft.title || !draft.title.trim()) return "ต้องใส่ชื่องาน";
  if (!isIsoDate(draft.startDate) || !isIsoDate(draft.endDate)) return "ต้องเลือกวันเริ่มและวันสิ้นสุด";
  if (daysBetween(draft.startDate, draft.endDate) < 0) return "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม";
  if (!draft.assignees || draft.assignees.length === 0) return "ต้องเลือกผู้รับผิดชอบอย่างน้อย 1 คน";
  return null;
}

export function validateProgressInput(input: { percent: number; note: string }): string | null {
  if (!input.note || !input.note.trim()) return "ต้องเขียนว่าวันนี้ทำอะไรไปบ้าง";
  if (!Number.isFinite(input.percent) || input.percent < 0 || input.percent > 100) return "เปอร์เซ็นต์ต้องอยู่ระหว่าง 0–100";
  return null;
}

/** โปรเจกต์ที่คนนี้ต้องเห็น (แอดมินเห็นทุกอัน) */
export function projectsForViewer(
  projects: WorkProject[],
  viewer: { isAdmin: boolean; staffCode: string | null }
): WorkProject[] {
  if (viewer.isAdmin) return projects;
  if (!viewer.staffCode) return [];
  return projects.filter((project) => project.assignees.includes(viewer.staffCode as string));
}

/** เรียงให้เรื่องที่ต้องรีบอยู่บนสุด: กำลังทำก่อน แล้วดูวันสิ้นสุดใกล้สุด */
export function sortProjects(projects: WorkProject[]): WorkProject[] {
  const rank: Record<ProjectStatus, number> = { active: 0, done: 1, cancelled: 2 };
  return [...projects].sort((a, b) => rank[a.status] - rank[b.status] || a.endDate.localeCompare(b.endDate));
}
