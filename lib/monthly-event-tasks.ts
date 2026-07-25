// งานประจำเดือน (Monthly tasks) — งานที่แอดมินมอบหมายให้ทำภายในเดือน
// ใช้เป็น checklist จริงบน Dashboard: แสดงงานของเดือนปัจจุบัน พร้อมสถานะ กำหนดส่ง และหลักฐาน
// งาน event รายเดือนเป็นแบบ admin-assigned (กำหนดก่อนสิ้นเดือนที่ผ่านมา)
// สถานะ: not_started (ยังไม่เริ่ม) · in_progress (กำลังทำ) · submitted (ส่งตรวจแล้ว) · done (เสร็จสิ้น) · overdue (เลยกำหนด)
//
// logic ในไฟล์นี้ตั้งใจให้ไม่มี side effect และรับ now/monthKey เป็น argument ได้
// เพื่อให้หน้า /monthly-summary นำ occurrence ไปสรุปต่อได้ในอนาคต

import { storeHoursForWorkDate } from "./workflow-records.ts";

export type MonthlyTaskCategory = "event" | "stock";

// สถานะที่ผู้ใช้/แอดมิน "บันทึก" ได้จริง (overdue เป็นสถานะที่คำนวณจากเวลา ไม่ใช่บันทึกเอง)
export type MonthlyTaskState = "not_started" | "in_progress" | "submitted" | "done";

export type MonthlyTaskStatus = MonthlyTaskState | "overdue";

export type MonthlyEventTask = {
  id: string;
  name: string;
  category: MonthlyTaskCategory;
  schedule: string;
  note: string;
};

export type MonthlyTaskOccurrence = {
  key: string;
  taskId: string;
  name: string;
  category: MonthlyTaskCategory;
  categoryLabel: string;
  schedule: string;
  note: string;
  monthKey: string;
  monthLabel: string;
  deadlineKey: string;
  state: MonthlyTaskState;
  status: MonthlyTaskStatus;
};

// งาน event รายเดือน — admin-assigned กำหนดก่อนสิ้นเดือนที่ผ่านมา
export const monthlyEventTasks: MonthlyEventTask[] = [
  {
    id: "monthly-event-booth",
    name: "ออกบูธ",
    category: "event",
    schedule: "กำหนดก่อนสิ้นเดือนที่ผ่านมา",
    note: "งานออกบูธที่แอดมินมอบหมาย เตรียมของ จัดบูธ และสรุปยอด/ภาพหน้างาน"
  },
  {
    id: "monthly-event-large",
    name: "งานอีเว้นใหญ่",
    category: "event",
    schedule: "กำหนดก่อนสิ้นเดือนที่ผ่านมา",
    note: "งานอีเว้นใหญ่ประจำเดือน วางแผน ประสานงาน และสรุปผลหลังจบงาน"
  }
];

// งาน stock รายเดือน — นับสต๊อกรวมและ single card ให้ครบก่อนสิ้นเดือน
export const monthlyStockTasks: MonthlyEventTask[] = [
  {
    id: "monthly-stock-count",
    name: "นับ Stock รวมประจำเดือน",
    category: "stock",
    schedule: "กำหนดก่อนสิ้นเดือน",
    note: "นับสต๊อกรวมทั้งร้านให้ตรงกับระบบก่อนสิ้นเดือน"
  },
  {
    id: "monthly-stock-single-pokemon",
    name: "นับ Single card - Pokémon",
    category: "stock",
    schedule: "กำหนดก่อนสิ้นเดือน",
    note: "นับ Single card กลุ่ม Pokémon"
  },
  {
    id: "monthly-stock-single-lorcana",
    name: "นับ Single card - Lorcana",
    category: "stock",
    schedule: "กำหนดก่อนสิ้นเดือน",
    note: "นับ Single card กลุ่ม Lorcana"
  },
  {
    id: "monthly-stock-single-lift-bound",
    name: "นับ Single card - Lift Bound",
    category: "stock",
    schedule: "กำหนดก่อนสิ้นเดือน",
    note: "นับ Single card กลุ่ม Lift Bound"
  },
  {
    id: "monthly-stock-discrepancy",
    name: "สรุปยอดต่างและรายการที่ต้องปรับในระบบ",
    category: "stock",
    schedule: "หลังนับ Stock เสร็จ",
    note: "สรุปยอดที่ต่างจากระบบและรายการที่ต้องปรับ ส่งให้แอดมินตรวจ"
  }
];

// รายการงานประจำเดือนทั้งหมด (event ก่อน แล้วตามด้วย stock)
export const monthlyTasks: MonthlyEventTask[] = [...monthlyEventTasks, ...monthlyStockTasks];

export const monthlyTaskStatusText: Record<MonthlyTaskStatus, string> = {
  not_started: "ยังไม่เริ่ม",
  in_progress: "กำลังทำ",
  submitted: "ส่งตรวจแล้ว",
  done: "เสร็จสิ้น",
  overdue: "เลยกำหนด"
};

// map สถานะ → สีการ์ดตามระบบเดิม (workflow-status-*)
export const monthlyTaskStatusClass: Record<MonthlyTaskStatus, string> = {
  not_started: "workflow-status-white",
  in_progress: "workflow-status-orange",
  submitted: "workflow-status-purple",
  done: "workflow-status-green",
  overdue: "workflow-status-red"
};

// map สถานะ → สี pill ในหน้า checklist
export const monthlyTaskPillClass: Record<MonthlyTaskStatus, string> = {
  not_started: "monthly-pill-idle",
  in_progress: "monthly-pill-active",
  submitted: "monthly-pill-review",
  done: "monthly-pill-done",
  overdue: "monthly-pill-overdue"
};

const categoryLabels: Record<MonthlyTaskCategory, string> = {
  event: "งานอีเว้นต์",
  stock: "งาน Stock"
};

export function monthlyCategoryLabel(category: MonthlyTaskCategory) {
  return categoryLabels[category];
}

const thaiMonths = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม"
];

// เดือนแบบ YYYY-MM ในเขตเวลาไทย
export function bangkokMonthKey(date = new Date()) {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit"
  }).format(date);
  // en-CA ให้ YYYY-MM (บาง engine ใส่วันด้วย) → ตัดเอาแค่ปี-เดือน
  return formatted.slice(0, 7);
}

export function monthLabelTh(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return `${thaiMonths[(month - 1 + 12) % 12]} ${year}`;
}

// วันสุดท้ายของเดือน (YYYY-MM-DD)
export function monthEndKey(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  // Date.UTC(year, month, 0) → month เป็น index เดือนถัดไป, day 0 = วันสุดท้ายของเดือนนี้
  const last = new Date(Date.UTC(year, month, 0));
  return `${monthKey}-${String(last.getUTCDate()).padStart(2, "0")}`;
}

// เส้นตายของงานประจำเดือน = เวลาปิดร้านของวันสุดท้ายของเดือน
export function monthDeadline(monthKey: string) {
  const endKey = monthEndKey(monthKey);
  const close = storeHoursForWorkDate(endKey).close;
  return new Date(`${endKey}T${close}:00+07:00`);
}

export function occurrenceKey(taskId: string, monthKey: string) {
  return `${taskId}:${monthKey}`;
}

// สถานะจริงของงานหนึ่งชิ้นในเดือนหนึ่ง เทียบกับสถานะที่บันทึกไว้และเวลาปัจจุบัน
export function monthlyOccurrenceStatus(
  monthKey: string,
  state: MonthlyTaskState,
  now = new Date()
): MonthlyTaskStatus {
  if (state === "done") return "done";
  if (state === "submitted") return "submitted";
  if (now.getTime() > monthDeadline(monthKey).getTime()) return "overdue";
  if (state === "in_progress") return "in_progress";
  return "not_started";
}

// รายการงานประจำเดือนของเดือนที่ระบุ (เดือนปัจจุบันบน dashboard)
export function monthlyTaskOccurrences(
  monthKey: string,
  stateByKey: Record<string, MonthlyTaskState> = {},
  tasks: MonthlyEventTask[] = monthlyTasks,
  now = new Date()
): MonthlyTaskOccurrence[] {
  const monthLabel = monthLabelTh(monthKey);
  const deadlineKey = monthEndKey(monthKey);

  return tasks.map((task) => {
    const key = occurrenceKey(task.id, monthKey);
    const state = stateByKey[key] ?? "not_started";
    return {
      key,
      taskId: task.id,
      name: task.name,
      category: task.category,
      categoryLabel: categoryLabels[task.category],
      schedule: task.schedule,
      note: task.note,
      monthKey,
      monthLabel,
      deadlineKey,
      state,
      status: monthlyOccurrenceStatus(monthKey, state, now)
    };
  });
}

export function monthlyTasksSubmitHref(taskId?: string) {
  return taskId ? `/monthly-tasks#${taskId}` : "/monthly-tasks";
}
