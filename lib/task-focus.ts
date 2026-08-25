// Task Focus Board — ใบงาน #YrTvFzXrSgWkIn5T9dyL
//
// หน้าการทำงานหลักต้องตอบได้ใน 3 วินาทีว่า "ตอนนี้ต้องทำอะไร และต้องเสร็จเมื่อไร". ไฟล์นี้คือ
// ตัวจัดลำดับ: รวมงานทุกชนิดให้เป็นการ์ดหน้าตาเดียวกัน (FocusTask) แล้วเรียงตามความเร่งด่วนจริง
// — เกินกำหนดขึ้นก่อน แล้วค่อยงานที่ใกล้ครบกำหนดที่สุด. งานที่เสร็จแล้วถูกดันลงกลุ่มล่างเสมอ
// เพื่อไม่ให้แย่งพื้นที่งานค้าง.
//
// pure logic ล้วน (ไม่แตะ network / DOM) — เวลาอ้างอิงส่งเข้ามาเป็นพารามิเตอร์ทุกครั้งเพื่อให้ test ได้.

import { displayNameFor } from "./employee-directory.ts";
import { currentOwnerOf } from "./project-handover.ts";
import type { WorkAssignment } from "./work-assignments-store.ts";
import { currentPercent, hasProgressOn, isSingleDay, projectMode, type WorkProject } from "./work-projects.ts";

/** ความเร่งด่วนของงาน 1 ใบ — สีและลำดับบนหน้าจอมาจากค่านี้ค่าเดียว */
export type FocusUrgency = "overdue" | "due_soon" | "today" | "in_progress" | "waiting_review" | "done";

/** ใกล้ครบกำหนดคือเหลือไม่เกินกี่นาที (ตามใบงาน: 30 นาที) */
export const DUE_SOON_MINUTES = 30;

export const URGENCY_LABEL: Record<FocusUrgency, string> = {
  overdue: "เกินกำหนด",
  due_soon: "ใกล้ครบกำหนด",
  today: "ต้องทำวันนี้",
  in_progress: "กำลังทำ",
  waiting_review: "รอตรวจ",
  done: "เสร็จแล้ว"
};

/** class สีสถานะ — ใช้ชุดเดียวกับทั้งเว็บ: แดง=เกินกำหนด ส้ม=ใกล้ครบ เหลือง=วันนี้ น้ำเงิน=กำลังทำ เขียว=เสร็จ */
export const URGENCY_CLASS: Record<FocusUrgency, string> = {
  overdue: "focus-red",
  due_soon: "focus-orange",
  today: "focus-yellow",
  in_progress: "focus-blue",
  waiting_review: "focus-blue",
  done: "focus-green"
};

export type FocusTask = {
  id: string;
  source: "assignment" | "project";
  title: string;
  /** กำหนดส่งจริง (epoch ms) — ไม่มีกำหนดเวลาในวัน ให้ปิดที่ 23:59 เวลาไทยของวันนั้น */
  dueAt: number;
  /** วันที่กำหนดส่ง (YYYY-MM-DD) ไว้แสดงเมื่อไม่ใช่วันนี้ */
  dueDate: string;
  /** เวลาที่ต้องเสร็จในวันนั้น เช่น "15:30" (ไม่ระบุ = ทั้งวัน) */
  dueTime?: string;
  urgency: FocusUrgency;
  /** ผู้รับผิดชอบที่ต้องลงมือตอนนี้ */
  ownerLabel: string;
  ownerCode: string;
  /** ปุ่มเดียวที่ควรกดต่อ */
  ctaLabel: string;
  href: string;
  /** บรรทัดสั้นๆ บอกสถานะ เช่น "ต้องแก้: ใส่รูปให้ครบ" */
  note?: string;
};

const BANGKOK_OFFSET = "+07:00";

/** แปลง (วัน, เวลา) เวลาไทย → epoch ms. ไม่ระบุเวลา = สิ้นวัน 23:59 */
export function deadlineMs(date: string, time?: string): number {
  const hhmm = time && /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, "0") : "23:59";
  return new Date(`${date}T${hhmm}:59${BANGKOK_OFFSET}`).getTime();
}

/** นาทีที่เหลือถึงกำหนด (ติดลบ = เลยมาแล้ว) */
export function minutesLeft(dueAt: number, now: number): number {
  return Math.round((dueAt - now) / 60000);
}

/**
 * ข้อความนับถอยหลังที่อ่านแล้วรู้เรื่องทันที: "เหลือ 18 นาที" / "เกินกำหนด 25 นาที" /
 * "เหลือ 2 ชั่วโมง" / "เกินกำหนด 3 วัน".
 */
export function countdownLabel(dueAt: number, now: number): string {
  const diff = minutesLeft(dueAt, now);
  const abs = Math.abs(diff);
  const prefix = diff < 0 ? "เกินกำหนด" : "เหลือ";
  if (abs < 60) return `${prefix} ${abs} นาที`;
  if (abs < 60 * 24) return `${prefix} ${Math.floor(abs / 60)} ชั่วโมง`;
  return `${prefix} ${Math.floor(abs / (60 * 24))} วัน`;
}

/** เวลากำหนดส่งแบบสั้น — "ต้องเสร็จภายใน 15:30" หรือ "ภายในวันที่ …" */
export function deadlineLabel(task: Pick<FocusTask, "dueDate" | "dueTime">, today: string): string {
  if (task.dueDate === today) return task.dueTime ? `ต้องเสร็จภายใน ${task.dueTime}` : "ต้องเสร็จภายในวันนี้";
  return task.dueTime ? `ภายใน ${task.dueDate} ${task.dueTime}` : `ภายใน ${task.dueDate}`;
}

function urgencyFor(input: { dueAt: number; now: number; started: boolean; today: string; dueDate: string }): FocusUrgency {
  const left = minutesLeft(input.dueAt, input.now);
  if (left < 0) return "overdue";
  if (left <= DUE_SOON_MINUTES) return "due_soon";
  if (input.started) return "in_progress";
  if (input.dueDate <= input.today) return "today";
  return "in_progress";
}

// ---- แปลงงานแต่ละชนิดเป็นการ์ดเดียวกัน --------------------------------------

/** งานที่เจ้าของร้านมอบหมายรายวัน (work_assignments) */
export function assignmentToFocusTask(assignment: WorkAssignment, now: number, today: string): FocusTask {
  const dueAt = deadlineMs(assignment.workDate, assignment.dueTime);
  const base = {
    id: assignment.id,
    source: "assignment" as const,
    title: assignment.title,
    dueAt,
    dueDate: assignment.workDate,
    ...(assignment.dueTime ? { dueTime: assignment.dueTime } : {}),
    ownerCode: assignment.staffCode,
    ownerLabel: displayNameFor(assignment.staffCode),
    href: `/assigned-work/task/${encodeURIComponent(assignment.id)}`
  };
  if (assignment.status === "done") {
    return { ...base, urgency: "done", ctaLabel: "ดูงาน", note: "ผ่านแล้ว" };
  }
  if (assignment.status === "submitted") {
    return { ...base, urgency: "waiting_review", ctaLabel: "ดูงานที่ส่ง", note: "ส่งแล้ว รอตรวจ" };
  }
  if (assignment.status === "needs_revision") {
    return {
      ...base,
      urgency: minutesLeft(dueAt, now) < 0 ? "overdue" : "due_soon",
      ctaLabel: "แก้ไขงาน",
      ...(assignment.revisionNote ? { note: `ต้องแก้: ${assignment.revisionNote}` } : {})
    };
  }
  const started = (assignment.progress || []).length > 0;
  return {
    ...base,
    urgency: urgencyFor({ dueAt, now, started, today, dueDate: assignment.workDate }),
    ctaLabel: started ? "ทำต่อ" : "เริ่มงาน"
  };
}

/** งานที่มอบหมายแบบโปรเจกต์ (work_projects) — กำหนดคือวันสิ้นสุด, ระหว่างทางต้องลง progress รายวัน */
export function projectToFocusTask(project: WorkProject, now: number, today: string): FocusTask {
  const dueAt = deadlineMs(project.endDate, project.timing?.dueTime);
  const owner = currentOwnerOf(project);
  const base = {
    id: project.id,
    source: "project" as const,
    title: project.title,
    dueAt,
    dueDate: project.endDate,
    ...(project.timing?.dueTime ? { dueTime: project.timing.dueTime } : {}),
    ownerCode: owner,
    ownerLabel: displayNameFor(owner),
    href: "/projects"
  };
  if (project.status !== "active") {
    return { ...base, urgency: "done", ctaLabel: "ดูงาน", note: project.status === "done" ? "เสร็จแล้ว" : "ยกเลิกแล้ว" };
  }
  const percent = currentPercent(project);
  const updatedToday = hasProgressOn(project, today);
  const single = isSingleDay(project);
  const urgency = updatedToday && minutesLeft(dueAt, now) > DUE_SOON_MINUTES
    ? "in_progress"
    : urgencyFor({ dueAt, now, started: percent > 0, today, dueDate: project.endDate });
  return {
    ...base,
    urgency,
    ctaLabel: single ? "ส่งงาน" : updatedToday ? "อัปเดตเพิ่ม" : "อัปเดตความคืบหน้า",
    note: single
      ? undefined
      : updatedToday
        ? `${percent}% · วันนี้อัปเดตแล้ว`
        : `${percent}% · วันนี้ยังไม่ได้อัปเดต${projectMode(project) === "group" ? " (ใครในทีมก็ได้)" : ""}`
  };
}

// ---- จัดลำดับ + นับหัวแถบ ------------------------------------------------------

const ORDER: Record<FocusUrgency, number> = {
  overdue: 0,
  due_soon: 1,
  today: 2,
  in_progress: 3,
  waiting_review: 4,
  done: 5
};

/** เรียงงาน: เกินกำหนดก่อน → ใกล้ครบกำหนดที่สุด → งานปกติ · งานเสร็จแล้วท้ายสุดเสมอ */
export function sortFocusTasks(tasks: FocusTask[]): FocusTask[] {
  return [...tasks].sort((a, b) => ORDER[a.urgency] - ORDER[b.urgency] || a.dueAt - b.dueAt || a.title.localeCompare(b.title));
}

export type FocusBoard = {
  /** งานที่ต้องลงมือตอนนี้ (ทุกอย่างที่ยังไม่เสร็จและไม่ได้รอตรวจ) */
  now: FocusTask[];
  /** ส่งแล้วรอเจ้าของตรวจ */
  waiting: FocusTask[];
  /** เสร็จแล้ว — ซ่อนไว้ใน dropdown */
  done: FocusTask[];
  counts: { overdue: number; dueSoon: number; today: number; inProgress: number; done: number };
};

export function buildFocusBoard(tasks: FocusTask[]): FocusBoard {
  const sorted = sortFocusTasks(tasks);
  return {
    now: sorted.filter((task) => task.urgency !== "done" && task.urgency !== "waiting_review"),
    waiting: sorted.filter((task) => task.urgency === "waiting_review"),
    done: sorted.filter((task) => task.urgency === "done"),
    counts: {
      overdue: sorted.filter((task) => task.urgency === "overdue").length,
      dueSoon: sorted.filter((task) => task.urgency === "due_soon").length,
      today: sorted.filter((task) => task.urgency === "today").length,
      inProgress: sorted.filter((task) => task.urgency === "in_progress").length,
      done: sorted.filter((task) => task.urgency === "done").length
    }
  };
}

/** งานที่ต้องตามด่วนสำหรับแอดมิน: เกินกำหนด + ใกล้ครบกำหนด + ที่ส่งมารอตรวจ */
export function adminFollowUps(board: FocusBoard): FocusTask[] {
  return [...board.now.filter((task) => task.urgency === "overdue" || task.urgency === "due_soon"), ...board.waiting];
}
