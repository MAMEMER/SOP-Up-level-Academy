// ส่งต่องาน (handover) ของ "งานที่มอบหมาย" — ใบงาน #iDBqn3jEPy4GN5i0Z7hK
//
// งานที่ยังไม่เสร็จส่งต่อให้คนกะถัดไปได้ โดยประวัติผู้รับผิดชอบเดิมไม่หาย: เอกสารงานเก็บ
// `originalOwner` (คนแรก), `currentOwner` (คนปัจจุบัน) และ ledger `handovers` ที่ต่อท้ายอย่างเดียว
// ห้ามแก้ย้อนหลัง. ทุกอย่างในไฟล์นี้เป็น pure logic — การเขียนจริงอยู่ที่ /api/work-projects.
//
// KPI ผูกกับ "คนที่ถือครองงานในวันนั้น" ไม่ใช่คนที่ถูกสั่งงานคนแรก:
//   - วันล่าช้า  → หักตามอัตราเดิมของระบบ (project-review.ts) แต่กระจายตาม owner รายวัน
//   - วันที่งานยังอยู่ในกำหนดแต่ไม่มี activity เลย → หัก owner ของวันนั้นวันละ 1 (idleDay)
// ทั้งสองอย่างคิดจากข้อมูลในเอกสารตรงๆ (deterministic id) จึง idempotent — กดซ้ำ/รีรันไม่บวกซ้ำ.

import { displayNameFor } from "./employee-directory.ts";
import type { ScoreAdjustment } from "./score-adjustments.ts";
import { addDays, daysBetween, hasProgressOn, isIsoDate, type WorkProject } from "./work-projects.ts";

/** accepted = ส่งต่อปกติ (ผู้รับรับงานอัตโนมัติ) · forced = แอดมินบังคับเปลี่ยนผู้รับผิดชอบ */
export type ProjectHandoverStatus = "accepted" | "forced";

export type ProjectHandover = {
  id: string;
  /** staff code ผู้ส่ง (owner เดิม) */
  from: string;
  /** staff code ผู้รับ (owner ใหม่) */
  to: string;
  /** วันทำงานที่การส่งต่อเริ่มมีผล (YYYY-MM-DD เวลาไทย) */
  date: string;
  /** เวลาจริงที่กดส่งต่อ (ISO) */
  at: string;
  status: ProjectHandoverStatus;
  /** รายละเอียดงานที่ส่งต่อ / เหตุผลที่แอดมินเปลี่ยนคน */
  note?: string;
  /** ลิงก์ไฟล์-รูปหลักฐานที่แนบตอนส่งต่อ */
  attachments?: string[];
  /** อีเมลผู้กด (มาจาก session เสมอ) */
  by: string;
  byName?: string;
};

/** จำนวนการส่งต่อที่เก็บต่องาน (กันเอกสารบวมชนลิมิต 1MiB ของ Firestore) */
export const MAX_PROJECT_HANDOVERS = 100;

/** ผู้รับผิดชอบคนแรกของงาน — งานเก่าที่ยังไม่มีฟิลด์นี้ ใช้ชื่อแรกในรายชื่อที่สั่งไว้ */
export function originalOwnerOf(project: Pick<WorkProject, "originalOwner" | "assignees">): string {
  return project.originalOwner || project.assignees[0] || "";
}

/** เรียงการส่งต่อเก่า→ใหม่ (วันมีผลก่อน แล้วค่อยเวลาที่กด) */
export function handoverHistory(project: Pick<WorkProject, "handovers">): ProjectHandover[] {
  return [...(project.handovers || [])].sort((a, b) => (a.date === b.date ? a.at.localeCompare(b.at) : a.date.localeCompare(b.date)));
}

/** ผู้รับผิดชอบปัจจุบัน — ตัวที่ระบบใช้ตัดสินสิทธิ์ทุกอย่าง */
export function currentOwnerOf(project: Pick<WorkProject, "currentOwner" | "originalOwner" | "assignees" | "handovers">): string {
  if (project.currentOwner) return project.currentOwner;
  const last = handoverHistory(project).slice(-1)[0];
  return last ? last.to : originalOwnerOf(project);
}

/**
 * ใครถือครองงานอยู่ในวันนั้น — ใช้คิด KPI ย้อนหลัง. การส่งต่อมีผล "ตั้งแต่วันที่ส่ง" เป็นต้นไป
 * (ส่งต่อวันที่ 12 → วันที่ 12 เป็นของผู้รับแล้ว).
 */
export function ownerOnDate(
  project: Pick<WorkProject, "currentOwner" | "originalOwner" | "assignees" | "handovers">,
  date: string
): string {
  const applied = handoverHistory(project).filter((entry) => entry.date <= date);
  return applied.length ? applied[applied.length - 1].to : originalOwnerOf(project);
}

/** ทุกคนที่เคยถือครองงานนี้ เรียงตามลำดับการถือครอง (ไม่ซ้ำ) */
export function ownerChain(project: Pick<WorkProject, "currentOwner" | "originalOwner" | "assignees" | "handovers">): string[] {
  const chain = [originalOwnerOf(project), ...handoverHistory(project).map((entry) => entry.to)];
  return Array.from(new Set(chain.filter(Boolean)));
}

/** คนนี้เกี่ยวข้องกับงานนี้ไหม — เป็น owner ปัจจุบัน, เคยถือครอง, หรือมีชื่อในทีม */
export function isInvolved(project: WorkProject, staffCode: string): boolean {
  if (!staffCode) return false;
  return project.assignees.includes(staffCode) || ownerChain(project).includes(staffCode);
}

// ---- ส่งต่องาน ----------------------------------------------------------------

export type HandoverInput = {
  /** staff code ผู้รับ */
  to: string;
  /** วันที่การส่งต่อมีผล (ปกติ = วันนี้) */
  date: string;
  note?: string;
  attachments?: string[];
  /** แอดมินบังคับเปลี่ยนผู้รับผิดชอบ (ต้องมีเหตุผล) */
  forced?: boolean;
};

/** ข้อความ error ภาษาไทย หรือ null เมื่อส่งต่อได้ — ใช้ทั้ง client (กันกดพลาด) และ server (ตัวจริง) */
export function validateHandover(
  project: WorkProject,
  input: HandoverInput,
  actor: { staffCode: string; isAdmin: boolean }
): string | null {
  if (project.status !== "active") return "งานนี้ปิดแล้ว ส่งต่อไม่ได้";
  if (!input.to || !input.to.trim()) return "ต้องเลือกคนรับงาน";
  // รหัสพนักงานมาจาก body — กันค่าที่ไม่ใช่รหัสจริงหลุดไปเป็นเจ้าของงาน (งานจะไปค้างกับคนที่ไม่มีตัวตน)
  if (input.to.length > 40 || /[/\s]/.test(input.to)) return "รหัสพนักงานไม่ถูกต้อง";
  if (!isIsoDate(input.date)) return "วันที่ส่งต่อไม่ถูกต้อง";
  const owner = currentOwnerOf(project);
  if (!actor.isAdmin && actor.staffCode !== owner) return "ส่งต่อได้เฉพาะงานที่คุณเป็นผู้รับผิดชอบตอนนี้";
  if (input.to === owner) return "คนรับงานเป็นคนเดิมอยู่แล้ว";
  if (input.forced && !(input.note || "").trim()) return "แอดมินเปลี่ยนผู้รับผิดชอบต้องระบุเหตุผล";
  return null;
}

/**
 * คิดผลลัพธ์ของการส่งต่อ 1 ครั้ง — คืนเฉพาะฟิลด์ที่ต้องเขียนทับ (patch) ไม่แตะ progress/reviews.
 * ผู้รับถูกเพิ่มเข้า `assignees` ให้เห็นงานทันที และ **ไม่ถอดชื่อ owner เดิมออก** เพื่อให้
 * ประวัติ + สิทธิ์ดูงานเดิมยังอยู่ครบตามใบงาน.
 */
export function applyHandover(
  project: WorkProject,
  input: HandoverInput,
  meta: { at: string; by: string; byName?: string }
): { currentOwner: string; originalOwner: string; assignees: string[]; handovers: ProjectHandover[]; entry: ProjectHandover } {
  const from = currentOwnerOf(project);
  const entry: ProjectHandover = {
    id: `ho__${meta.at}__${input.to}`.replace(/[^a-zA-Z0-9_:\-.@]/g, "-").slice(0, 140),
    from,
    to: input.to,
    date: input.date,
    at: meta.at,
    status: input.forced ? "forced" : "accepted",
    ...((input.note || "").trim() ? { note: (input.note as string).trim() } : {}),
    ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    by: meta.by,
    ...(meta.byName ? { byName: meta.byName } : {})
  };
  return {
    currentOwner: input.to,
    originalOwner: originalOwnerOf(project),
    assignees: Array.from(new Set([...project.assignees, input.to])),
    handovers: [...(project.handovers || []), entry].slice(-MAX_PROJECT_HANDOVERS),
    entry
  };
}

/** บรรทัดสรุปการส่งต่อสำหรับ history/audit log */
export function handoverSummary(entry: ProjectHandover): string {
  const action = entry.status === "forced" ? "แอดมินเปลี่ยนผู้รับผิดชอบ" : "ส่งต่องาน";
  return `${action} ${displayNameFor(entry.from)} → ${displayNameFor(entry.to)} (${entry.date})${entry.note ? ` · ${entry.note}` : ""}`;
}

// ---- KPI ตามช่วงเวลาที่แต่ละคนถือครองงาน ----------------------------------------

/** วันในช่วง from…to (รวมปลายทั้งสองข้าง) — จำกัด 400 วันกันวนไม่จบ */
export function datesBetween(from: string, to: string): string[] {
  const span = daysBetween(from, to);
  if (span < 0) return [];
  const out: string[] = [];
  for (let index = 0; index <= Math.min(span, 400); index += 1) out.push(addDays(from, index));
  return out;
}

export type OwnerDayCharge = { assignee: string; days: string[] };

/**
 * แบ่ง "วันที่ล่าช้า" (วันถัดจากกำหนด … วันที่ส่งจริง) ให้ owner ที่ถือครองงานในแต่ละวัน.
 * งานที่ไม่เคยส่งต่อ → ได้ก้อนเดียวเป็นของ owner คนเดิมทั้งหมด (พฤติกรรมเดิมไม่เปลี่ยน).
 */
export function lateDaysByOwner(project: WorkProject, dueDate: string, submittedDate: string): OwnerDayCharge[] {
  const days = datesBetween(addDays(dueDate, 1), submittedDate);
  const grouped = new Map<string, string[]>();
  for (const date of days) {
    const owner = ownerOnDate(project, date);
    if (!owner) continue;
    grouped.set(owner, [...(grouped.get(owner) || []), date]);
  }
  return [...grouped.entries()].map(([assignee, dates]) => ({ assignee, days: dates }));
}

/**
 * กติกา "วันเงียบ" เริ่มมีผลวันไหน — งานที่ค้างมาก่อนหน้านี้ไม่ถูกหักย้อนหลัง เพราะตอนนั้น
 * ยังไม่มีกติกานี้ให้พนักงานรู้ตัว (คะแนนหมวดนี้ผูกกับเงินเดือน จึงไม่ย้อนหลังเด็ดขาด).
 */
export const IDLE_RULE_EFFECTIVE_FROM = "2026-08-25";

/**
 * วันที่งานยังอยู่ในกำหนดแต่ไม่มีใครอัปเดตความคืบหน้าเลย — หัก owner ของวันนั้นวันละ `perDay`.
 * นับเฉพาะวันที่ผ่านไปแล้ว (ไม่นับวันนี้ ยังมีเวลาเหลือ) และเฉพาะงานหลายวันที่ยังไม่ปิด —
 * งานวันเดียวตัดสินด้วยกำหนดส่งอยู่แล้ว หักซ้ำสองทางไม่ได้.
 */
export function idleDayAdjustments(project: WorkProject, today: string, perDay = 1, since = IDLE_RULE_EFFECTIVE_FROM): ScoreAdjustment[] {
  if (project.status !== "active") return [];
  if (perDay <= 0) return [];
  const lastScored = daysBetween(project.endDate, addDays(today, -1)) < 0 ? addDays(today, -1) : project.endDate;
  const firstScored = daysBetween(project.startDate, since) > 0 ? since : project.startDate;
  const out: ScoreAdjustment[] = [];
  for (const date of datesBetween(firstScored, lastScored)) {
    if (hasProgressOn(project, date)) continue;
    const owner = ownerOnDate(project, date);
    if (!owner) continue;
    out.push({
      id: `ph-idle-${project.id}-${date}-${owner}`.replace(/[^a-zA-Z0-9-]/g, "-"),
      workDate: date,
      employeeName: owner,
      category: "assigned_work",
      points: -Math.abs(perDay),
      reason: `งานที่มอบหมาย: ${project.title} — ไม่มีอัปเดตความคืบหน้าในวันนั้น`,
      recordedAt: `${date}T23:59:59.000Z`,
      recordedBy: "system"
    });
  }
  return out;
}
