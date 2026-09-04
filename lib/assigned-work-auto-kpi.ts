// Auto KPI สำหรับ "งานที่มอบหมาย" — ส่วนที่ทำงาน **อัตโนมัติล้วน ไม่ต้องให้แอดมินกดอะไร**
// (คู่ขนานกับระบบ Checklist ที่หัก "ขาดทั้งวัน" ให้เองจากข้อมูลจริง).
//
// เดิม KPI งานที่มอบหมายมีแค่ผลตรวจที่ owner กดยืนยัน (lib/project-review.ts: ผ่าน/ให้แก้/ช้า) —
// ต้องมีคนตัดสินคุณภาพก่อนถึงจะได้/เสียคะแนน. สิ่งที่ขาดคือกติกาข้อ 3 ของใบงาน QZIE:
//
//   "งานยังอยู่ภายในช่วงเวลาที่กำหนด แต่ผู้รับผิดชอบไม่อัปเดตความคืบหน้าในวันนั้น → −1 ต่อวัน"
//
// อันนี้ไม่ต้องใช้วิจารณญาณคน — ดูจาก timestamp ของ progress ได้ตรงๆ จึงคิดให้อัตโนมัติได้
// เต็มตัว. ไฟล์นี้อ่านงานโปรเจกต์ (lib/work-projects.ts) แล้วแปลง "วันที่ควรอัปเดตแต่เงียบ" เป็น
// score adjustment หมวด assigned_work — channel เดียวกับผลตรวจ owner — พนักงานจึงโดนหักจริง
// ในหน้าคะแนนโดยไม่ต้องแก้ engine.
//
// ไฟล์นี้เป็น pure logic ล้วน (ยึด opts.today ที่ส่งเข้ามา ไม่แตะ Date/network) → unit-test ได้ตรงๆ.

import type { ScoreAdjustment } from "./score-adjustments.ts";
import { effectiveDue, reviewEntriesFor } from "./project-review.ts";
import { ownerOnDate } from "./project-handover.ts";
import {
  addDays,
  daysBetween,
  isSingleDay,
  projectMode,
  type ProjectReviewOutcome,
  type WorkProject
} from "./work-projects.ts";

// เริ่มนับกติกา "ไม่อัปเดตความคืบหน้า" ตั้งแต่วันนี้เป็นต้นไป — ไม่ย้อนหลังไปหักงวดที่ปิดจ่ายไปแล้ว
// (แพตเทิร์นเดียวกับ CHECKLIST_DEDUCTION_START). ตั้งเป็นต้นเดือนถัดไปเพื่อไม่ให้ตกกลางงวด.
export const ASSIGNED_WORK_AUTO_KPI_START = "2026-09-01";

// เท่าไหร่ก็ได้ที่ผู้รับผิดชอบ "จบภาระอัปเดต" แล้ว — ผ่านแล้ว/แก้แล้วผ่าน ก็ไม่ต้องอัปเดตต่อ
const PASS_OUTCOMES = new Set<ProjectReviewOutcome>(["early_pass", "ontime_pass", "fixed_pass"]);

/** วันที่ (YYYY-MM-DD) ที่คนนี้ผ่านงานแล้ว → หลังจากนั้นไม่ต้องอัปเดตอีก (null = ยังไม่ผ่าน) */
function assigneePassDate(project: Pick<WorkProject, "reviews">, assignee: string): string | null {
  const entries = reviewEntriesFor(project, assignee);
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const e = entries[i];
    if (PASS_OUTCOMES.has(e.outcome)) return e.submittedDate || e.confirmedAt.slice(0, 10);
  }
  return null;
}

/** min(a, b) สำหรับวันที่ YYYY-MM-DD */
function earlierDate(a: string, b: string): string {
  return daysBetween(a, b) < 0 ? b : a;
}

/** max(a, b) สำหรับวันที่ YYYY-MM-DD */
function laterDate(a: string, b: string): string {
  return daysBetween(a, b) > 0 ? b : a;
}

export type NoProgressOptions = {
  /** วันนี้ (YYYY-MM-DD, เวลาไทย) — วันนี้ยังไม่จบ จึงไม่คิด นับได้ถึง "เมื่อวาน" */
  today: string;
  /** หักกี่คะแนนต่อวันที่เงียบ (ค่าเริ่มต้น 1) — ปรับได้ที่ /admin/kpi-rules */
  ratePerDay?: number;
  /** เริ่มนับตั้งแต่วันไหน (กันหักย้อนหลัง) — ค่าเริ่มต้น ASSIGNED_WORK_AUTO_KPI_START */
  startFrom?: string;
  /**
   * วันที่พนักงาน "เข้าทำงานจริงตามกะ" (มีกะ + ตอกบัตรเข้างาน) — key = `${employeeName}:${workDate}`.
   * ใบงาน YOW: หักเฉพาะวันที่พนักงานเข้าทำงานจริงแต่ไม่อัปเดตงาน — ไม่หักวันที่ไม่ได้เข้ากะ
   * (วันหยุด/OFF/ลา) แม้งานจะยังอยู่ในช่วงเวลาที่กำหนด. เป็น key เดียวกับหมวด Checklist
   * (schedule ∩ clock-in) เพื่อให้สองระบบตัดสิน "วันทำงานจริง" เหมือนกัน.
   * - ถ้าส่งมา → หักเฉพาะวันที่อยู่ในเซ็ตนี้เท่านั้น
   * - ถ้า "ไม่ส่ง" (undefined) → ไม่กรองด้วยการเข้างาน (พฤติกรรมเดิม, ใช้ในเทสต์ pure logic)
   */
  workedDays?: Set<string>;
};

/**
 * แปลง "วันที่ควรอัปเดตความคืบหน้าแต่ไม่มีใครลง" → score adjustment (หัก) รายคนรายวัน.
 *
 * กติกาต่องาน ต่อคน:
 *  - คิดเฉพาะงานหลายวัน (งานวันเดียวส่งครั้งเดียวจบ ไม่มีรอบ progress รายวัน)
 *  - หน้าต่างเวลา = [max(วันเริ่ม, startFrom) … min(กำหนดส่งของคนนั้น, เมื่อวาน)]
 *      · ยกเลิกกำหนดใหม่ถ้าถูกสั่งแก้ (effectiveDue ใน project-review)
 *      · ถ้าผ่านแล้ว ตัดหน้าต่างที่วันผ่าน — ผ่านแล้วไม่ต้องอัปเดตต่อ
 *      · ถ้างานปิด (done) ตัดที่วันอัปเดตล่าสุด — ทำจบแล้วไม่ต้องอัปเดตต่อ
 *  - งานกลุ่ม: ใครในทีมอัปเดตวันนั้นก็ถือว่าครบทั้งวัน (ตาม teamNeedsProgressToday)
 *  - งานเดี่ยว: เจ้าของงานต้องอัปเดตเอง คนอื่นลงแทนไม่นับ — งานที่ส่งต่อแล้ว (lib/project-handover.ts)
 *    หักเฉพาะ "คนที่ถือครองงานในวันนั้น" ไม่ใช่ทุกคนที่เคยมีชื่อ ไม่งั้นวันเดียวโดนหักสองหัว
 *  - งานยกเลิก (cancelled): ข้ามทั้งงาน
 *  - เข้างานจริง (opts.workedDays): หักเฉพาะวันที่คนนั้น "เข้าทำงานจริงตามกะ" — วันหยุด/OFF/ลา
 *    ไม่โดนหักแม้งานยังอยู่ในกำหนด (ใบงาน YOW)
 */
export function projectNoProgressAdjustments(projects: WorkProject[], opts: NoProgressOptions): ScoreAdjustment[] {
  const ratePerDay = Math.abs(Math.round(opts.ratePerDay ?? 1));
  if (ratePerDay === 0) return [];
  const startFrom = opts.startFrom ?? ASSIGNED_WORK_AUTO_KPI_START;
  const workedDays = opts.workedDays;
  const yesterday = addDays(opts.today, -1);
  const out: ScoreAdjustment[] = [];

  for (const project of projects) {
    if (project.status === "cancelled") continue;
    if (isSingleDay(project)) continue;

    const isGroup = projectMode(project) === "group";
    const teamDates = new Set((project.progress || []).map((entry) => entry.date));
    const lastProgressDate = (project.progress || []).reduce<string | null>(
      (max, entry) => (max === null || daysBetween(max, entry.date) > 0 ? entry.date : max),
      null
    );

    for (const assignee of project.assignees) {
      // กำหนดส่งที่มีผลกับคนนี้ (เดิม หรือกำหนดแก้ใหม่)
      let end = effectiveDue(project, assignee);
      // วันนี้ยังไม่จบ → นับได้ถึงเมื่อวาน
      end = earlierDate(end, yesterday);
      // ผ่านแล้ว → ตัดที่วันผ่าน
      const passDate = assigneePassDate(project, assignee);
      if (passDate) end = earlierDate(end, passDate);
      // งานปิดแล้ว → ตัดที่วันอัปเดตล่าสุด (ทำจบแล้วไม่ต้องอัปเดตต่อ)
      if (project.status === "done" && lastProgressDate) end = earlierDate(end, lastProgressDate);

      const start = laterDate(project.startDate, startFrom);
      const span = daysBetween(start, end); // จำนวนวันจาก start ถึง end
      if (span < 0) continue;

      const personDatesForSingle = isGroup
        ? null
        : new Set((project.progress || []).filter((entry) => entry.by === assignee).map((entry) => entry.date));

      // safety: กันลูปหลุด (โปรเจกต์ยาวเกินจริง) — สอดคล้องกับ MAX_PROJECT_PROGRESS
      const maxDays = Math.min(span, 400);
      for (let offset = 0; offset <= maxDays; offset += 1) {
        const date = addDays(start, offset);
        // ใบงาน YOW: หักเฉพาะวันที่พนักงาน "เข้าทำงานจริงตามกะ" — วันหยุด/OFF/ลา ไม่หัก
        // แม้งานยังอยู่ในกำหนด (ถ้าไม่ส่ง workedDays มา = ไม่กรอง = พฤติกรรมเดิม)
        if (workedDays && !workedDays.has(`${assignee}:${date}`)) continue;
        // งานเดี่ยวที่เคยส่งต่อ: วันนั้นเป็นภาระของ owner ณ วันนั้นคนเดียว
        if (!isGroup && (project.handovers || []).length > 0 && ownerOnDate(project, date) !== assignee) continue;
        const updated = isGroup ? teamDates.has(date) : (personDatesForSingle as Set<string>).has(date);
        if (updated) continue;
        out.push({
          id: `awnp-${project.id}-${assignee}-${date}`.replace(/[^a-zA-Z0-9-]/g, "-"),
          workDate: date,
          employeeName: assignee,
          category: "assigned_work",
          points: -ratePerDay,
          reason: `งานที่มอบหมาย: ${project.title} — ไม่อัปเดตความคืบหน้าในวันนั้น`,
          recordedAt: `${date}T23:59:59.000+07:00`,
          recordedBy: "auto"
        });
      }
    }
  }

  return out;
}
