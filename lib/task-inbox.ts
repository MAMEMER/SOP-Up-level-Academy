// ระบบงานที่มอบหมาย รอบใหม่ (Champ 2026-10-04): หน้าแจ้งเตือนงาน · แฟ้มงานรายเดือน · หน้าตรวจงาน
//
// ต่อยอดจากเอกสารเดิมใน `sop_work_projects` (ไม่ย้ายข้อมูล) แต่เปลี่ยนวิธีคิด 3 อย่าง:
//  1. เจ้าของเลือกได้ว่างานนับความคืบหน้าแบบไหน (TrackMode) — ไม่ต้องให้น้องเดา % เองอีก
//  2. งานจบด้วย "ส่งงานสมบูรณ์ + หลักฐาน" (submissions) ส่งแล้วหายจากหน้าแจ้งเตือน รอเจ้าของตรวจ
//  3. เจ้าของตรวจรอบท้าย: คอมเมนต์ + รูป + คะแนน +/− (ปรับเองได้) → ผ่าน (เขียว) / ให้แก้ไข (แดง)
//
// ไฟล์นี้เป็น pure logic ล้วน ให้ unit test ได้ตรงๆ.

import { effectiveDue, netReviewPoints, reviewEntriesFor } from "./project-review.ts";
import { monthOfDate } from "./project-month.ts";
import {
  addDays,
  clampPercent,
  currentPercent,
  daysBetween,
  isSingleDay,
  projectMode,
  type TaskSubmission,
  type TrackMode,
  type WorkProject
} from "./work-projects.ts";

export const TRACK_MODES: TrackMode[] = ["done", "workdays", "amount", "percent"];

export const TRACK_MODE_LABEL: Record<TrackMode, string> = {
  done: "เสร็จ / ไม่เสร็จ",
  workdays: "นับวันทำงาน",
  amount: "นับเป็นเนื้องาน",
  percent: "เปอร์เซ็นต์ (แบบเดิม)"
};

export const TRACK_MODE_HINT: Record<TrackMode, string> = {
  done: "งานสั้นๆ เช่น ติดลูกโป่ง — ไม่มีความคืบหน้า กดส่งพร้อมรูปตอนเสร็จ",
  workdays: "เช่น นับการ์ดกองนี้ 5 วันทำงาน — นับเฉพาะวันที่เข้ากะ น้องส่งทุกวันว่าทำไปเท่าไร",
  amount: "มีเป้าเป็นตัวเลข เช่น 3,000 ใบ — น้องส่งทุกวันว่าทำเพิ่มไปกี่ใบ ระบบรวมให้",
  percent: "น้องเลื่อนแถบ % เอง"
};

/** งานเก่าที่ไม่ได้ตั้งไว้: วันเดียว = เสร็จ/ไม่เสร็จ · หลายวัน = % แบบเดิม */
export function trackModeOf(project: Pick<WorkProject, "trackMode" | "startDate" | "endDate">): TrackMode {
  if (project.trackMode && TRACK_MODES.includes(project.trackMode)) return project.trackMode;
  return isSingleDay(project) ? "done" : "percent";
}

/** ต้องส่งความคืบหน้าระหว่างทางไหม (done = ไม่ต้อง ส่งครั้งเดียวตอนเสร็จ) */
export function hasDailyUpdates(project: WorkProject): boolean {
  return trackModeOf(project) !== "done";
}

// ---- เนื้องาน ------------------------------------------------------------------

/** รวมที่ทำไปแล้ว (trackMode amount) */
export function amountDone(project: Pick<WorkProject, "progress">): number {
  return (project.progress || []).reduce((sum, entry) => sum + (Number.isFinite(entry.amount) ? Number(entry.amount) : 0), 0);
}

export function amountLeft(project: WorkProject): number {
  return Math.max(0, (project.targetAmount || 0) - amountDone(project));
}

// ---- วันทำงาน ------------------------------------------------------------------

/**
 * วันทำงาน N วันแรกนับจาก start — นับเฉพาะวันที่มีกะ (worked). หลังวันสุดท้ายที่วางกะไว้แล้ว
 * (lastPlanned) ยังไม่รู้ว่าใครเข้าวันไหน ถือว่าทุกวันเป็นวันทำงานไปก่อน — พอวางกะเพิ่ม
 * ระบบคำนวณใหม่ให้เองตอนโหลด. กันวนไม่จบที่ 180 วัน.
 */
export function workingDates(start: string, n: number, worked: Set<string>, lastPlanned: string | null): string[] {
  const out: string[] = [];
  const count = Math.max(1, Math.min(60, Math.round(n)));
  for (let i = 0; i < 180 && out.length < count; i += 1) {
    const date = addDays(start, i);
    const planned = lastPlanned !== null && date <= lastPlanned;
    if (!planned || worked.has(date)) out.push(date);
  }
  return out;
}

/** วันทำงานที่เหลือ (นับวันนี้ด้วย) */
export function workdaysLeft(project: Pick<WorkProject, "workDayDates">, today: string): number {
  return (project.workDayDates || []).filter((date) => date >= today).length;
}

/** วันนี้เป็นวันทำงานที่เท่าไร (0 = ยังไม่ถึง / วันนี้ไม่มีกะ) */
export function workdayIndex(project: Pick<WorkProject, "workDayDates">, today: string): number {
  const index = (project.workDayDates || []).indexOf(today);
  return index + 1;
}

// ---- ส่งงาน --------------------------------------------------------------------

/** การส่งงานสมบูรณ์ที่นับให้คนนี้ (งานกลุ่ม: ใครในทีมส่งก็นับ) เรียงเก่า→ใหม่ */
export function submissionsFor(project: WorkProject, assignee: string): TaskSubmission[] {
  const group = projectMode(project) === "group";
  return (project.submissions || []).filter((entry) => group || entry.by === assignee).sort((a, b) => a.at.localeCompare(b.at));
}

export function lastSubmissionFor(project: WorkProject, assignee: string): TaskSubmission | undefined {
  return submissionsFor(project, assignee).slice(-1)[0];
}

export function validateSubmission(input: { note: string; images: string[] }): string | null {
  if (!input.images.length) return "ต้องแนบรูปหลักฐานอย่างน้อย 1 รูป";
  if (!input.note.trim()) return "ต้องเขียนสรุปงานสั้นๆ";
  return null;
}

// ---- สถานะต่อคน ---------------------------------------------------------------

export type TaskState =
  | "active" // กำลังทำ — อยู่ในหน้าแจ้งเตือน
  | "needs_fix" // เจ้าของสั่งแก้ — กลับมาอยู่ในหน้าแจ้งเตือน
  | "submitted" // ส่งสมบูรณ์แล้ว รอเจ้าของตรวจ
  | "passed" // เจ้าของให้ผ่านแล้ว — ดูย้อนหลังได้อย่างเดียว
  | "cancelled";

export const TASK_STATE_LABEL: Record<TaskState, string> = {
  active: "กำลังทำ",
  needs_fix: "ต้องแก้ไข",
  submitted: "รอตรวจ",
  passed: "ผ่านแล้ว",
  cancelled: "ยกเลิก"
};

export function taskState(project: WorkProject, assignee: string): TaskState {
  if (project.status === "cancelled") return "cancelled";
  const last = reviewEntriesFor(project, assignee).slice(-1)[0];
  const sub = lastSubmissionFor(project, assignee);
  if (last) {
    if (last.outcome !== "needs_fix") return "passed";
    return sub && sub.at > last.confirmedAt ? "submitted" : "needs_fix";
  }
  if (sub) return "submitted";
  // งานรุ่นเก่าที่ปิดด้วย 100% (ก่อนมีปุ่มส่งงาน) — ถือว่าส่งแล้ว รอตรวจ
  // (งานรุ่นใหม่ดูจาก submissions/reviews รายคนเท่านั้น ไม่งั้นคนแรกส่ง = งานของอีกคนหายไปด้วย)
  // รายคน: คนนี้ยังไม่ถูกตรวจ + งานยังไม่มีระบบส่งงานใหม่เลย = งานเก่าที่รอตรวจ (งานใหม่ status done
  // ก็ต่อเมื่อทุกคนส่งแล้วเท่านั้น — ดู everyoneDone)
  if (project.status === "done" && !(project.submissions || []).length) return "submitted";
  return "active";
}

/** ทุกคนในงานส่งแล้ว/ผ่านแล้ว — ถึงตอนนั้นค่อยปิดงาน (status done) ไม่งั้นคนที่ยังไม่ส่งจะไม่ได้รับการเตือน */
export function everyoneDone(project: WorkProject): boolean {
  return project.assignees.every((code) => {
    const state = taskState(project, code);
    return state === "submitted" || state === "passed";
  });
}

/** กำหนดส่งที่มีผลกับคนนี้ (สั่งแก้แล้ว = กำหนดใหม่) */
export function dueFor(project: WorkProject, assignee: string): string {
  return effectiveDue(project, assignee);
}

/** เหลืออีกกี่วันถึงกำหนด (วันนี้ = 0, เลยมาแล้ว = ติดลบ) */
export function daysToDue(project: WorkProject, assignee: string, today: string): number {
  return daysBetween(today, dueFor(project, assignee));
}

export function isLateFor(project: WorkProject, assignee: string, today: string): boolean {
  const state = taskState(project, assignee);
  return (state === "active" || state === "needs_fix") && daysToDue(project, assignee, today) < 0;
}

/** สีของงานในแฟ้ม: เขียว = ผ่าน · แดง = ต้องแก้ / เลยกำหนด / ผ่านแต่โดนหัก · เหลือง = รอตรวจ */
export type TaskTone = "green" | "red" | "amber" | "neutral";

export function taskTone(project: WorkProject, assignee: string, today: string): TaskTone {
  const state = taskState(project, assignee);
  if (state === "cancelled") return "neutral";
  if (state === "needs_fix" || isLateFor(project, assignee, today)) return "red";
  if (state === "passed") return netReviewPoints(reviewEntriesFor(project, assignee)) < 0 ? "red" : "green";
  if (state === "submitted") return "amber";
  return "neutral";
}

/** ข้อความนับถอยหลังที่น้องอ่านแล้วรู้ทันทีว่าต้องส่งวันไหน */
export function countdownText(project: WorkProject, assignee: string, today: string): string {
  const due = dueFor(project, assignee);
  const diff = daysBetween(today, due);
  if (trackModeOf(project) === "workdays" && taskState(project, assignee) === "active") {
    const left = workdaysLeft(project, today);
    if (diff < 0) return `เลยกำหนดมา ${-diff} วัน`;
    return left <= 1 ? "วันทำงานสุดท้าย — ต้องส่งวันนี้" : `เหลืออีก ${left} วันทำงาน`;
  }
  if (diff < 0) return `เลยกำหนดมา ${-diff} วัน`;
  if (diff === 0) return "ต้องส่งวันนี้";
  if (diff === 1) return "ส่งพรุ่งนี้";
  return `เหลืออีก ${diff} วัน`;
}

/** ความคืบหน้าเป็นคำพูด (ไม่ใช่ % ลอยๆ) */
export function progressText(project: WorkProject, today: string): string {
  const mode = trackModeOf(project);
  const updates = (project.progress || []).length;
  if (mode === "amount") {
    const unit = project.unit || "";
    return `ทำแล้ว ${amountDone(project).toLocaleString("th-TH")} / ${(project.targetAmount || 0).toLocaleString("th-TH")} ${unit}`.trim();
  }
  if (mode === "workdays") {
    const total = (project.workDayDates || []).length || project.workDays || 0;
    const index = workdayIndex(project, today);
    return `${index ? `วันทำงานที่ ${index} จาก ${total}` : `ให้เวลา ${total} วันทำงาน`} · ส่งอัปเดตแล้ว ${updates} ครั้ง`;
  }
  if (mode === "percent") return `${currentPercent(project)}% · ส่งอัปเดตแล้ว ${updates} ครั้ง`;
  return "ส่งครั้งเดียวตอนเสร็จ";
}

/** % สำหรับแถบ (amount คิดจากเป้า · percent ตามที่ลง · ที่เหลือไม่มีแถบ) */
export function progressBarPercent(project: WorkProject): number | null {
  const mode = trackModeOf(project);
  if (mode === "amount") return project.targetAmount ? clampPercent((amountDone(project) / project.targetAmount) * 100) : 0;
  if (mode === "percent") return currentPercent(project);
  return null;
}

// ---- ลิสต์ ---------------------------------------------------------------------

const byDue = (assignee: string) => (a: WorkProject, b: WorkProject) => dueFor(a, assignee).localeCompare(dueFor(b, assignee));

/** หน้าแจ้งเตือนงาน: งานที่ต้องทำ/ต้องแก้ ของคนนี้ — ไม่หายจนกว่าจะกดส่งสมบูรณ์ */
export function inboxTasks(projects: WorkProject[], assignee: string): WorkProject[] {
  return projects
    .filter((project) => project.assignees.includes(assignee))
    .filter((project) => {
      const state = taskState(project, assignee);
      return state === "active" || state === "needs_fix";
    })
    .sort((a, b) => {
      // ต้องแก้ขึ้นก่อน แล้วเรียงตามกำหนดส่ง
      const fixA = taskState(a, assignee) === "needs_fix" ? 0 : 1;
      const fixB = taskState(b, assignee) === "needs_fix" ? 0 : 1;
      return fixA - fixB || byDue(assignee)(a, b);
    });
}

/** เดือนของงาน = เดือนของวันเริ่ม (แบบเดียวกับกระดาน /admin/projects) */
export function taskMonth(project: Pick<WorkProject, "startDate">): string | null {
  return monthOfDate(project.startDate);
}

export type MonthFolder = {
  month: string;
  tasks: WorkProject[];
  green: number;
  red: number;
  waiting: number;
  active: number;
};

const TONE_RANK: Record<TaskTone, number> = { red: 0, amber: 1, neutral: 2, green: 3 };

/** สีของงาน 1 แถวเมื่อดูหลายคนพร้อมกัน (แฟ้มทีม) — ยึดคนที่แย่ที่สุด */
export function rowTone(project: WorkProject, codes: string[], today: string): TaskTone {
  const mine = project.assignees.filter((code) => codes.includes(code));
  if (!mine.length) return "neutral";
  return mine.map((code) => taskTone(project, code, today)).sort((a, b) => TONE_RANK[a] - TONE_RANK[b])[0];
}

/** สถานะของแถว (หลายคน) — ต้องแก้ > กำลังทำ > รอตรวจ > ผ่าน */
export function rowState(project: WorkProject, codes: string[]): TaskState {
  const order: TaskState[] = ["needs_fix", "active", "submitted", "passed", "cancelled"];
  const states = project.assignees.filter((code) => codes.includes(code)).map((code) => taskState(project, code));
  return order.find((state) => states.includes(state)) ?? "cancelled";
}

/** แฟ้มงานรายเดือนของคนนี้ (หรือทั้งทีม) ใหม่สุดก่อน */
export function monthFolders(projects: WorkProject[], codes: string | string[], today: string): MonthFolder[] {
  const list = Array.isArray(codes) ? codes : [codes];
  const map = new Map<string, WorkProject[]>();
  for (const project of projects) {
    if (!project.assignees.some((code) => list.includes(code))) continue;
    const month = taskMonth(project);
    if (!month) continue;
    map.set(month, [...(map.get(month) || []), project]);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, tasks]) => {
      const tones = tasks.map((task) => rowTone(task, list, today));
      const states = tasks.map((task) => rowState(task, list));
      return {
        month,
        tasks: [...tasks].sort((a, b) => a.endDate.localeCompare(b.endDate)),
        green: tones.filter((tone) => tone === "green").length,
        red: tones.filter((tone) => tone === "red").length,
        waiting: states.filter((state) => state === "submitted").length,
        active: states.filter((state) => state === "active" || state === "needs_fix").length
      };
    });
}

export type FileSections = { active: WorkProject[]; needsFix: WorkProject[]; waiting: WorkProject[]; passed: WorkProject[] };

/** แบ่งงานในแฟ้มเป็น 4 กอง: กำลังทำ · ต้องแก้ไข · รอตรวจ · เรียบร้อยแล้ว */
export function fileSections(tasks: WorkProject[], codes: string | string[]): FileSections {
  const list = Array.isArray(codes) ? codes : [codes];
  const out: FileSections = { active: [], needsFix: [], waiting: [], passed: [] };
  for (const task of tasks) {
    const state = rowState(task, list);
    if (state === "active") out.active.push(task);
    else if (state === "needs_fix") out.needsFix.push(task);
    else if (state === "submitted") out.waiting.push(task);
    else if (state === "passed") out.passed.push(task);
  }
  return out;
}

/** สรุปต่อคนสำหรับหน้าตรวจงาน */
export function staffTaskCounts(projects: WorkProject[], assignee: string, today: string) {
  const mine = projects.filter((project) => project.assignees.includes(assignee));
  const states = mine.map((project) => taskState(project, assignee));
  return {
    waiting: states.filter((state) => state === "submitted").length,
    needsFix: states.filter((state) => state === "needs_fix").length,
    active: states.filter((state) => state === "active").length,
    late: mine.filter((project) => isLateFor(project, assignee, today)).length
  };
}

// ---- งานใหญ่ / งานย่อย ----------------------------------------------------------

export function childrenOf(projects: WorkProject[], parentId: string): WorkProject[] {
  return projects.filter((project) => project.parentId === parentId);
}

export function parentTitleOf(projects: WorkProject[], project: WorkProject): string | null {
  if (!project.parentId) return null;
  return projects.find((candidate) => candidate.id === project.parentId)?.title ?? null;
}

// ---- ตรวจค่าตอนสั่งงาน ----------------------------------------------------------

export function validateTrack(input: { trackMode?: TrackMode; workDays?: number; targetAmount?: number }): string | null {
  if (input.trackMode === "workdays") {
    if (!Number.isFinite(input.workDays) || (input.workDays as number) < 1 || (input.workDays as number) > 60) {
      return "จำนวนวันทำงานต้องอยู่ระหว่าง 1–60 วัน";
    }
  }
  if (input.trackMode === "amount") {
    if (!Number.isFinite(input.targetAmount) || (input.targetAmount as number) <= 0) return "ต้องใส่เป้าหมายเป็นตัวเลขมากกว่า 0";
  }
  return null;
}
