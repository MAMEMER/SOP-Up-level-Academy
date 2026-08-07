// Read-only month view of the shift plan for staff ("ตารางกะของฉัน").
//
// The planner at /admin/schedule is owner-only and editable. Staff still need to answer
// "วันไหนฉันเข้ากี่โมง / ใครเข้ากับฉัน" without being able to change anything, so this
// module turns a month's plan docs into a plain grid: one row per person, one cell per
// day, with the entry time on working days. No writes exist on this path — the /schedule
// page renders these rows and nothing else.
//
// Pure (no Firestore / no DOM) so the grid, the ordering and the labels are unit-tested.

import { gamePreset, taskPreset } from "./planner-activities.ts";
import {
  isLeaveAssignment,
  isWorkingAssignment,
  shiftEndTime,
  summariseStaff,
  type PlanCell,
  type ShiftAssignment,
  type StaffSummary
} from "./shift-schedule.ts";

const THAI_WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"] as const;

export type ScheduleDay = {
  workDate: string; // YYYY-MM-DD
  day: number; // 1..31
  weekday: number; // 0=Sun … 6=Sat
  weekdayLabel: string;
  isWeekend: boolean;
};

/** Every day of a YYYY-MM month, with Thai weekday labels. */
export function monthDays(month: string): ScheduleDay[] {
  const [year, mon] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const days: ScheduleDay[] = [];
  for (let day = 1; day <= lastDay; day += 1) {
    const workDate = `${month}-${String(day).padStart(2, "0")}`;
    const weekday = new Date(`${workDate}T00:00:00Z`).getUTCDay();
    days.push({
      workDate,
      day,
      weekday,
      weekdayLabel: THAI_WEEKDAYS[weekday],
      isWeekend: weekday === 0 || weekday === 6
    });
  }
  return days;
}

export type ScheduleCell = {
  workDate: string;
  assignment: ShiftAssignment | null;
  /** entry time on a working day, else null */
  startTime: string | null;
  /** "09:00-18:00" on a working day, else null */
  timeRange: string | null;
  /** what to print in the cell */
  label: string;
  /** css modifier: s1 | s2 | off | leave | blank */
  tone: "s1" | "s2" | "off" | "leave" | "blank";
};

const LEAVE_LABELS: Record<string, string> = {
  leave_personal: "ลากิจ",
  leave_sick: "ลาป่วย"
};

/** One grid cell: the entry time when working, otherwise หยุด / ลา / blank. */
export function scheduleCell(workDate: string, plan: PlanCell | undefined): ScheduleCell {
  const assignment = plan?.assignment ?? null;

  if (assignment && isWorkingAssignment(assignment)) {
    const startTime = plan?.startTime || (assignment === "s1" ? "09:00" : "11:30");
    return {
      workDate,
      assignment,
      startTime,
      timeRange: `${startTime}-${shiftEndTime(startTime)}`,
      label: startTime,
      tone: assignment
    };
  }
  if (assignment && isLeaveAssignment(assignment)) {
    return {
      workDate,
      assignment,
      startTime: null,
      timeRange: null,
      label: LEAVE_LABELS[assignment] ?? "ลา",
      tone: "leave"
    };
  }
  if (assignment === "off") {
    return { workDate, assignment, startTime: null, timeRange: null, label: "หยุด", tone: "off" };
  }
  return { workDate, assignment: null, startTime: null, timeRange: null, label: "—", tone: "blank" };
}

export type ScheduleRow = {
  staffCode: string;
  displayName: string;
  /** this row belongs to the signed-in staffer */
  isMe: boolean;
  cells: ScheduleCell[];
  summary: StaffSummary;
};

export type StaffEntry = { code: string; displayName: string };

/**
 * One row per staff member, in the order staff should read them: yourself first (you
 * open this page to find your own days), then everyone else by display name.
 */
export function buildScheduleRows(
  staff: StaffEntry[],
  plans: PlanCell[],
  days: ScheduleDay[],
  myStaffCode?: string | null
): ScheduleRow[] {
  const planByKey = new Map<string, PlanCell>();
  for (const plan of plans) planByKey.set(`${plan.staffCode}__${plan.workDate}`, plan);

  const rows = staff.map((entry) => ({
    staffCode: entry.code,
    displayName: entry.displayName,
    isMe: Boolean(myStaffCode) && entry.code === myStaffCode,
    cells: days.map((day) => scheduleCell(day.workDate, planByKey.get(`${entry.code}__${day.workDate}`))),
    summary: summariseStaff(entry.code, plans)
  }));

  return rows.sort((a, b) => {
    if (a.isMe !== b.isMe) return a.isMe ? -1 : 1;
    return a.displayName.localeCompare(b.displayName, "th");
  });
}

/** A day's activity as the calendar prints it: a game event or a Stock งานประจำ. */
export type ActivityChip = {
  key: string;
  label: string;
  kind: "game" | "task";
  time: string | null;
  /** game logo path, task chips have none */
  logo: string | null;
  /** short badge text for task chips */
  badge: string | null;
  /** checklist link for task chips */
  href: string | null;
};

/** The day annotation the owner writes on the planner (schedule_events). */
export type DayEventInput = {
  workDate: string;
  title?: string;
  activities?: { game?: string; time?: string; title?: string }[];
};

/**
 * Activities of one day, in the order the owner added them. Game keys resolve to their
 * logo, Stock งานประจำ keys to their badge + checklist link; anything unknown still
 * shows with whatever title was saved, so a hand-typed activity never disappears.
 */
export function dayActivityChips(event: DayEventInput | undefined): ActivityChip[] {
  if (!event?.activities?.length) return [];
  return event.activities.map((activity, index) => {
    const game = gamePreset(activity.game);
    const task = taskPreset(activity.game);
    const time = activity.time?.trim() ? activity.time : null;
    if (task) {
      return { key: `${task.key}-${index}`, label: task.label, kind: "task", time, logo: null, badge: task.badge, href: task.href };
    }
    return {
      key: `${activity.game || "activity"}-${index}`,
      label: game?.label ?? activity.title ?? activity.game ?? "กิจกรรม",
      kind: "game",
      time,
      logo: game?.logo ?? null,
      badge: null,
      href: null
    };
  });
}

export type CalendarCell = {
  day: ScheduleDay | null; // null = padding before the 1st / after the last
  /** everyone rostered that day, earliest entry time first */
  working: { staffCode: string; displayName: string; timeRange: string; isMe: boolean; tone: "s1" | "s2" }[];
  /** events/งานประจำ the owner put on that date in the planner */
  activities: ActivityChip[];
  /** the free-text note typed on the planner's กิจกรรม row, if any */
  note: string | null;
  /** the signed-in staffer's own cell that day — tone "blank" when nothing is planned;
   *  null only when the viewer is not on this branch's roster at all */
  mine: ScheduleCell | null;
};

/**
 * The month laid out as calendar weeks (Sunday-first, Thai convention), padded so the
 * 1st lands under its weekday. Each day carries who works and what the viewer's own
 * shift is, which is what the calendar squares print.
 */
export function calendarWeeks(
  rows: ScheduleRow[],
  days: ScheduleDay[],
  events: DayEventInput[] = []
): CalendarCell[][] {
  const blank = (): CalendarCell => ({ day: null, working: [], activities: [], note: null, mine: null });
  const eventByDate = new Map(events.map((event) => [event.workDate, event]));
  const cells: CalendarCell[] = [];

  for (let i = 0; i < (days[0]?.weekday ?? 0); i += 1) cells.push(blank());

  for (const day of days) {
    const working = rows
      .map((row) => {
        const cell = row.cells.find((item) => item.workDate === day.workDate);
        if (!cell?.timeRange || (cell.tone !== "s1" && cell.tone !== "s2")) return null;
        return {
          staffCode: row.staffCode,
          displayName: row.displayName,
          timeRange: cell.timeRange,
          isMe: row.isMe,
          tone: cell.tone
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((a, b) => a.timeRange.localeCompare(b.timeRange));

    const myRow = rows.find((row) => row.isMe);
    const event = eventByDate.get(day.workDate);
    cells.push({
      day,
      working,
      activities: dayActivityChips(event),
      note: event?.title?.trim() ? event.title.trim() : null,
      mine: myRow?.cells.find((item) => item.workDate === day.workDate) ?? null
    });
  }

  while (cells.length % 7 !== 0) cells.push(blank());

  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Column headers for the calendar, Sunday-first. */
export const calendarWeekdayLabels = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"] as const;

/** Who works on one date, with their hours — the "ใครเข้ากับฉันวันนี้" line. */
export function workingOn(rows: ScheduleRow[], workDate: string): { displayName: string; timeRange: string }[] {
  return rows
    .map((row) => {
      const cell = row.cells.find((item) => item.workDate === workDate);
      return cell?.timeRange ? { displayName: row.displayName, timeRange: cell.timeRange } : null;
    })
    .filter((entry): entry is { displayName: string; timeRange: string } => entry !== null)
    .sort((a, b) => a.timeRange.localeCompare(b.timeRange));
}

/** "เข้างาน 21 วัน · กะ1 11 · กะ2 10 · หยุด 8 · ลา 1" */
export function summaryLine(summary: StaffSummary): string {
  const parts = [
    `เข้างาน ${summary.totalWorkDays} วัน`,
    `กะ1 ${summary.s1Count}`,
    `กะ2 ${summary.s2Count}`,
    `หยุด ${summary.offCount}`
  ];
  const leave = summary.personalLeave + summary.sickLeave;
  if (leave > 0) parts.push(`ลา ${leave}`);
  return parts.join(" · ");
}

/** Previous / next YYYY-MM. */
export function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
] as const;

/** "สิงหาคม 2026" */
export function monthLabel(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  return `${THAI_MONTHS[(mon || 1) - 1]} ${year}`;
}
