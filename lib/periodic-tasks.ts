// Weekly / monthly shared tasks — the second checklist tab. Unlike the per-shift
// daily routine, these are team-shared ("ช่วยกันกับเพื่อน"): anyone on shift can
// tick an item and everyone sees it, because the whole team must finish them within
// the period. State is keyed by ISO week / calendar month so a new period starts
// fresh. Task content is static here; ticks live in Firestore (shared-tasks-store).

export type PeriodicTask = {
  id: string;
  title: string;
  hint?: string;
};

export const weeklyTasks: PeriodicTask[] = [
  { id: "w-sleeve", title: "นับ Sleeve / อุปกรณ์ทั้งหมด", hint: "เทียบกับ StoreHub" },
  { id: "w-booster", title: "นับ Booster box / Box all cards" },
  { id: "w-clean", title: "ทำความสะอาดใหญ่พื้นที่เล่น + ตู้โชว์" },
  { id: "w-supply", title: "สรุปของที่ต้องสั่งเพิ่มประจำสัปดาห์ จาก StoreHub Supply Needs" }
];

export const monthlyTasks: PeriodicTask[] = [
  { id: "m-stock", title: "นับ Stock รวมประจำเดือน" },
  { id: "m-single", title: "นับ Single card แยกแฟ้ม" },
  { id: "m-diff", title: "สรุปยอดต่างและรายการปรับใน StoreHub" }
];

/** ISO-week key like 2026-W30 for a given YYYY-MM-DD (Bangkok noon anchor). */
export function isoWeekKey(workDate: string): string {
  const date = new Date(`${workDate}T12:00:00+07:00`);
  // Shift to Thursday of this week (ISO weeks are Thursday-anchored).
  const day = (date.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Calendar-month key like 2026-07 for a given YYYY-MM-DD. */
export function monthKey(workDate: string): string {
  return workDate.slice(0, 7);
}

export function periodKeyFor(period: "weekly" | "monthly", workDate: string): string {
  return period === "weekly" ? isoWeekKey(workDate) : monthKey(workDate);
}

export function tasksFor(period: "weekly" | "monthly"): PeriodicTask[] {
  return period === "weekly" ? weeklyTasks : monthlyTasks;
}
