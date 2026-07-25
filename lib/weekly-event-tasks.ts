// งานประจำสัปดาห์ (Weekly event tasks) — ตารางกิจกรรมตามวันในสัปดาห์
// ใช้เป็น checklist จริงบน Dashboard: แสดงเฉพาะรอบของสัปดาห์ปัจจุบัน พร้อมสถานะงาน
// สถานะ: waiting (รอตามรอบ) · not_started (ยังไม่เริ่ม) · done (เสร็จแล้ว) · overdue (เลยกำหนด)

import { storeHoursForWorkDate } from "./workflow-records.ts";

// weekday: 0=อาทิตย์ ... 6=เสาร์ (ตรงกับ Date.getDay ในเขตเวลาไทย)
export type WeeklyEventTask = {
  id: string;
  name: string;
  game: string;
  weekdays: number[];
  note: string;
};

export type WeeklyTaskStatus = "waiting" | "not_started" | "done" | "overdue";

export type WeeklyTaskOccurrence = {
  key: string;
  taskId: string;
  name: string;
  game: string;
  note: string;
  dateKey: string;
  weekday: number;
  weekdayLabel: string;
  roundLabel: string;
  isToday: boolean;
  status: WeeklyTaskStatus;
};

export const weeklyEventTasks: WeeklyEventTask[] = [
  { id: "gym-pokemon", name: "Gym Pokémon", game: "Pokémon", weekdays: [2, 5, 6], note: "จัดกิจกรรม Gym ทุกวันอังคาร ศุกร์ และเสาร์" },
  { id: "lorcana-core", name: "Lorcana Core", game: "Lorcana", weekdays: [3, 4, 5, 6], note: "รอบ Core ทุกวันพุธถึงเสาร์" },
  { id: "lorcana-pack-rush", name: "Lorcana Pack Rush", game: "Lorcana", weekdays: [0], note: "รอบ Pack Rush ทุกวันอาทิตย์" }
];

export const weeklyTaskStatusText: Record<WeeklyTaskStatus, string> = {
  waiting: "รอตามรอบ",
  not_started: "ยังไม่เริ่ม",
  done: "เสร็จแล้ว",
  overdue: "เลยกำหนด"
};

// map สถานะ → สีตามระบบเดิม (workflow-status-*)
export const weeklyTaskStatusClass: Record<WeeklyTaskStatus, string> = {
  waiting: "workflow-status-white",
  not_started: "workflow-status-orange",
  done: "workflow-status-green",
  overdue: "workflow-status-red"
};

const weekdayLabelsTh = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

export function weekdayLabel(weekday: number) {
  return weekdayLabelsTh[((weekday % 7) + 7) % 7];
}

export function occurrenceKey(taskId: string, dateKey: string) {
  return `${taskId}:${dateKey}`;
}

// วันที่แบบ YYYY-MM-DD ในเขตเวลาไทย
export function bangkokDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function bangkokWeekday(dateKey: string) {
  const label = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", weekday: "short" }).format(
    new Date(`${dateKey}T12:00:00+07:00`)
  );
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(label);
}

function addDaysToKey(dateKey: string, days: number) {
  const base = new Date(`${dateKey}T12:00:00+07:00`);
  return bangkokDateKey(new Date(base.getTime() + days * 24 * 60 * 60 * 1000));
}

// วันจันทร์ที่เป็นต้นสัปดาห์ของ dateKey
export function startOfWeekKey(dateKey: string) {
  const weekday = bangkokWeekday(dateKey);
  const daysSinceMonday = (weekday + 6) % 7;
  return addDaysToKey(dateKey, -daysSinceMonday);
}

export function weekDates(mondayKey: string) {
  return Array.from({ length: 7 }, (_, index) => addDaysToKey(mondayKey, index));
}

export function roundLabelForDate(dateKey: string) {
  const hours = storeHoursForWorkDate(dateKey);
  return `${hours.open}–${hours.close}`;
}

// สถานะของงานรอบหนึ่ง เทียบกับ "วันนี้" (todayKey) และเวลาปัจจุบัน (now)
export function occurrenceStatus(
  dateKey: string,
  todayKey: string,
  done: boolean,
  now = new Date()
): WeeklyTaskStatus {
  if (done) return "done";
  if (dateKey > todayKey) return "waiting";
  if (dateKey < todayKey) return "overdue";
  // วันนี้: เลยเวลาปิดร้านแล้วแต่ยังไม่ส่ง → เลยกำหนด, ไม่งั้น → ยังไม่เริ่ม
  const closeAt = new Date(`${dateKey}T${storeHoursForWorkDate(dateKey).close}:00+07:00`);
  return now.getTime() > closeAt.getTime() ? "overdue" : "not_started";
}

// รายการงานรอบทั้งหมดของสัปดาห์ที่มี todayKey อยู่ (เรียงตามวัน แล้วตามลำดับ task)
export function weeklyTaskOccurrences(
  todayKey: string,
  doneKeys: Set<string> = new Set(),
  tasks: WeeklyEventTask[] = weeklyEventTasks,
  now = new Date()
): WeeklyTaskOccurrence[] {
  const monday = startOfWeekKey(todayKey);
  const dates = weekDates(monday);
  const occurrences: WeeklyTaskOccurrence[] = [];

  for (const dateKey of dates) {
    const weekday = bangkokWeekday(dateKey);
    for (const task of tasks) {
      if (!task.weekdays.includes(weekday)) continue;
      const key = occurrenceKey(task.id, dateKey);
      occurrences.push({
        key,
        taskId: task.id,
        name: task.name,
        game: task.game,
        note: task.note,
        dateKey,
        weekday,
        weekdayLabel: weekdayLabel(weekday),
        roundLabel: roundLabelForDate(dateKey),
        isToday: dateKey === todayKey,
        status: occurrenceStatus(dateKey, todayKey, doneKeys.has(key), now)
      });
    }
  }

  return occurrences;
}

export function weeklyTasksManageHref() {
  return "/weekly-tasks";
}
