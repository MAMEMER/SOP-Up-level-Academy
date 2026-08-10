// "งานวันนี้ทั้งหมด" — the one board at the top of the staff dashboard.
//
// The dashboard grew a section per source (daily หัวข้อ, Stock work, Weekly event,
// งานที่มอบหมาย, งานประจำเดือน), so a staffer had to read five grids and work out for
// themselves what is actually left today. This module merges every source into one
// ranked list: what is late, then what is due today, then what is coming, then what is
// already done — with the per-section grids kept below as the detail view.
//
// Pure (no Firestore / no DOM): the component maps each source into the small input
// shapes below and this decides state, wording and order.

export type TodayWorkKind = "daily" | "stock" | "weekly" | "monthly" | "assigned" | "handoff" | "delivery";

/** overdue = ต้องทำแต่เลยเวลา · due = ต้องทำวันนี้ · upcoming = ยังไม่ถึงกำหนด · done = เสร็จแล้ว */
export type TodayWorkState = "overdue" | "due" | "upcoming" | "done";

export type TodayWorkItem = {
  id: string;
  kind: TodayWorkKind;
  kindLabel: string;
  title: string;
  detail?: string;
  href: string;
  state: TodayWorkState;
  statusText: string;
  statusClass: string;
};

export const kindLabels: Record<TodayWorkKind, string> = {
  daily: "งานรายวัน",
  stock: "งาน Stock",
  weekly: "งานสัปดาห์",
  monthly: "งานเดือน",
  assigned: "งานที่มอบหมาย",
  handoff: "งานส่งต่อ",
  delivery: "งานส่งของ"
};

const stateOrder: Record<TodayWorkState, number> = { overdue: 0, due: 1, upcoming: 2, done: 3 };
const kindOrder: Record<TodayWorkKind, number> = {
  assigned: 0,
  // ออเดอร์ลูกค้ามีกำหนดส่งภายใน 1 วัน — ต้องอยู่บนงานประจำที่ยืดหยุ่นกว่า
  delivery: 1,
  daily: 2,
  stock: 3,
  weekly: 4,
  monthly: 5,
  handoff: 6
};

const stateClass: Record<TodayWorkState, string> = {
  overdue: "workflow-status-orange",
  due: "workflow-status-white",
  upcoming: "workflow-status-white is-muted",
  done: "workflow-status-green"
};

/** One daily หัวข้อ of the กะ the staffer works today. */
export type DailyPhaseInput = {
  id: string;
  title: string;
  timeLabel: string;
  /** as returned by workflowVisualStatus */
  visualStatus: "white" | "green" | "orange" | "red" | "purple";
  completed: number;
  total: number;
};

/** A Stock งานประจำ planned on the shift grid (see planned-day-tasks.ts). */
export type StockTaskInput = {
  key: string;
  label: string;
  href: string;
  statusText: string;
  overdueDays: number;
  upcoming: boolean;
  submitted: boolean;
};

/** A weekly event whose day is today. */
export type WeeklyEventInput = {
  id: string;
  name: string;
  game: string;
  href: string;
  completed: number;
  total: number;
};

/** A งานประจำเดือน occurrence of the current month. */
export type MonthlyTaskInput = {
  taskId: string;
  name: string;
  href: string;
  /** monthly-event-tasks status */
  status: "not_started" | "in_progress" | "submitted" | "done" | "overdue";
  monthLabel?: string;
};

/** A KPI-linked assigned-work record for today. */
export type AssignedRecordInput = {
  id: string;
  title: string;
  href: string;
  employeeName: string;
  note?: string;
  /** as returned by effectiveAssignedWorkStatus */
  status: "early_quality" | "on_time" | "needs_revision" | "late_one_day" | "not_finished";
  /** admins see the verdict immediately; staff only after the deadline */
  showStatus: boolean;
};

/** ออเดอร์เว็บกิลด์ที่จ่ายเงินแล้วและยังต้องแพ็ค/ส่ง (see delivery-tasks.ts). */
export type DeliveryTaskInput = {
  id: string;
  title: string;
  detail?: string;
  statusText: string;
  /** as returned by deliveryTaskState */
  state: TodayWorkState;
};

/** An owner assignment / cross-shift handoff from the live feed. */
export type FeedItemInput = {
  id: string;
  origin: "owner" | "handoff";
  title: string;
  detail?: string;
  href: string;
  originLabel: string;
  statusText: string;
  statusClass: string;
};

const assignedStateByStatus: Record<AssignedRecordInput["status"], TodayWorkState> = {
  early_quality: "done",
  on_time: "done",
  needs_revision: "due",
  late_one_day: "due",
  not_finished: "overdue"
};

const assignedStatusText: Record<AssignedRecordInput["status"], string> = {
  early_quality: "เสร็จก่อนกำหนด",
  on_time: "เสร็จตรงเวลา",
  needs_revision: "ต้องแก้ไข",
  late_one_day: "ช้าไม่เกิน 1 วัน",
  not_finished: "ยังไม่เสร็จ"
};

function dailyState(phase: DailyPhaseInput): TodayWorkState {
  if (phase.visualStatus === "green" || phase.visualStatus === "purple") return "done";
  if (phase.visualStatus === "red") return "overdue";
  // orange = ส่งช้าแล้ว (มี record) หรือเลยเวลาแต่ยังส่งได้ — ทั้งสองยังต้องตามให้จบ
  if (phase.visualStatus === "orange") return phase.completed >= phase.total && phase.total > 0 ? "done" : "overdue";
  return "due";
}

function dailyStatusText(phase: DailyPhaseInput, state: TodayWorkState): string {
  const progress = `${phase.completed}/${phase.total}`;
  if (state === "done") return `เสร็จแล้ว · ${progress}`;
  if (state === "overdue") return `เลยเวลา · ${phase.timeLabel} · ${progress}`;
  return `${phase.timeLabel} · ${progress}`;
}

function monthlyState(status: MonthlyTaskInput["status"]): TodayWorkState {
  if (status === "done") return "done";
  if (status === "overdue") return "overdue";
  return "due";
}

const monthlyStatusText: Record<MonthlyTaskInput["status"], string> = {
  not_started: "ยังไม่เริ่ม",
  in_progress: "กำลังทำ",
  submitted: "ส่งตรวจแล้ว",
  done: "เสร็จสิ้น",
  overdue: "เลยกำหนด"
};

export type TodayWorkBoard = {
  items: TodayWorkItem[];
  summary: { total: number; done: number; remaining: number; overdue: number; dueToday: number };
};

/**
 * Merges every source into one ranked board. Order: late first, then due today, then
 * what is planned but not yet due, then what is finished — and within one state the
 * assigned work a person was personally given comes before the routine.
 */
export function buildTodayWorkBoard(input: {
  dailyPhases?: DailyPhaseInput[];
  stockTasks?: StockTaskInput[];
  weeklyEvents?: WeeklyEventInput[];
  monthlyTasks?: MonthlyTaskInput[];
  assignedRecords?: AssignedRecordInput[];
  feedItems?: FeedItemInput[];
  deliveryTasks?: DeliveryTaskInput[];
}): TodayWorkBoard {
  const items: TodayWorkItem[] = [];

  for (const phase of input.dailyPhases ?? []) {
    const state = dailyState(phase);
    items.push({
      id: `daily-${phase.id}`,
      kind: "daily",
      kindLabel: kindLabels.daily,
      title: phase.title,
      href: `/checklist#${phase.id}`,
      state,
      statusText: dailyStatusText(phase, state),
      statusClass: stateClass[state]
    });
  }

  for (const task of input.stockTasks ?? []) {
    const state: TodayWorkState = task.submitted
      ? "done"
      : task.upcoming
        ? "upcoming"
        : task.overdueDays > 0
          ? "overdue"
          : "due";
    items.push({
      id: `stock-${task.key}`,
      kind: "stock",
      kindLabel: kindLabels.stock,
      title: task.label,
      href: task.href,
      state,
      statusText: task.statusText,
      statusClass: stateClass[state]
    });
  }

  for (const event of input.weeklyEvents ?? []) {
    const done = event.total > 0 && event.completed === event.total;
    const state: TodayWorkState = done ? "done" : "due";
    items.push({
      id: `weekly-${event.id}`,
      kind: "weekly",
      kindLabel: kindLabels.weekly,
      title: event.name,
      detail: event.game,
      href: event.href,
      state,
      statusText: done ? `เสร็จแล้ว · ${event.completed}/${event.total}` : `ถึงกำหนดวันนี้ · ${event.completed}/${event.total}`,
      statusClass: stateClass[state]
    });
  }

  for (const task of input.monthlyTasks ?? []) {
    const state = monthlyState(task.status);
    items.push({
      id: `monthly-${task.taskId}`,
      kind: "monthly",
      kindLabel: kindLabels.monthly,
      title: task.name,
      href: task.href,
      state,
      statusText: task.monthLabel
        ? `${monthlyStatusText[task.status]} · ภายใน ${task.monthLabel}`
        : monthlyStatusText[task.status],
      statusClass: stateClass[state]
    });
  }

  for (const record of input.assignedRecords ?? []) {
    const state = assignedStateByStatus[record.status];
    items.push({
      id: `assigned-${record.id}`,
      kind: "assigned",
      kindLabel: kindLabels.assigned,
      title: record.title,
      detail: record.employeeName,
      href: record.href,
      state,
      statusText: record.showStatus ? assignedStatusText[record.status] : "รอส่งงาน",
      statusClass: record.showStatus ? stateClass[state] : stateClass.due
    });
  }

  for (const task of input.deliveryTasks ?? []) {
    items.push({
      id: `delivery-${task.id}`,
      kind: "delivery",
      kindLabel: kindLabels.delivery,
      title: task.title,
      detail: task.detail,
      href: "/#delivery-orders",
      state: task.state,
      statusText: task.statusText,
      statusClass: stateClass[task.state]
    });
  }

  for (const item of input.feedItems ?? []) {
    const done = item.statusClass.includes("green");
    const late = item.statusClass.includes("red");
    const state: TodayWorkState = done ? "done" : late ? "overdue" : "due";
    items.push({
      id: `feed-${item.id}`,
      kind: item.origin === "handoff" ? "handoff" : "assigned",
      kindLabel: item.origin === "handoff" ? kindLabels.handoff : kindLabels.assigned,
      title: item.title,
      detail: item.detail,
      href: item.href,
      state,
      statusText: `${item.originLabel} · ${item.statusText}`,
      statusClass: item.statusClass
    });
  }

  items.sort((a, b) => {
    const byState = stateOrder[a.state] - stateOrder[b.state];
    if (byState !== 0) return byState;
    const byKind = kindOrder[a.kind] - kindOrder[b.kind];
    if (byKind !== 0) return byKind;
    return a.title.localeCompare(b.title, "th");
  });

  const done = items.filter((item) => item.state === "done").length;
  return {
    items,
    summary: {
      total: items.length,
      done,
      remaining: items.length - done,
      overdue: items.filter((item) => item.state === "overdue").length,
      dueToday: items.filter((item) => item.state === "due").length
    }
  };
}

/** Headline under the board title: "เหลือ 4 จาก 9 · เลยเวลา 1". */
export function todayWorkHeadline(summary: TodayWorkBoard["summary"]): string {
  if (summary.total === 0) return "วันนี้ยังไม่มีงานที่ต้องทำ";
  if (summary.remaining === 0) return `เสร็จครบทั้ง ${summary.total} งานแล้ว`;
  const parts = [`เหลือ ${summary.remaining} จาก ${summary.total} งาน`];
  if (summary.overdue > 0) parts.push(`เลยเวลา ${summary.overdue}`);
  return parts.join(" · ");
}
