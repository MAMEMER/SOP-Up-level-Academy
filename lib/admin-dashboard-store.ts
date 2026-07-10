import type {
  AdminDashboardState,
  AdminReviewStatus,
  AuditLog,
  ChecklistItem,
  FinishTask,
  Issue,
  IssueStatus
} from "./admin-dashboard-data.ts";

export type AdminDashboardSummary = {
  totalChecklist: number;
  completedChecklist: number;
  pendingChecklist: number;
  lateChecklist: number;
  pendingOrders: number;
  issueCount: number;
  stockAlerts: number;
  staffOnline: number;
  completionRate: number;
};

export type FinishTaskGroup = {
  id: FinishTask["schedule"];
  title: string;
  dueLabel: string;
  total: number;
  completed: number;
  tasks: FinishTask[];
};

export type DailyTaskStatusSummary = {
  total: number;
  onTime: number;
  late: number;
  missed: number;
};

export type ChecklistIssueSummary = {
  checklistId: string;
  title: string;
  category: string;
  assignedTo: string;
  severity: "medium" | "high";
  reason: string;
  dueAt: string;
};

function isCompletedLate(item: Pick<ChecklistItem, "status" | "completedAt" | "dueAt">) {
  return item.status === "completed" && Boolean(item.completedAt) && item.completedAt! > item.dueAt;
}

function audit(actor: string, action: string, targetType: string, targetId: string, before: string, after: string, detail: string): AuditLog {
  return {
    id: `audit-${action}-${targetId}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    actor,
    action,
    targetType,
    targetId,
    before,
    after,
    detail
  };
}

function updateChecklistItem(
  state: AdminDashboardState,
  itemId: string,
  actorId: string,
  action: string,
  detail: string,
  update: (item: ChecklistItem) => ChecklistItem
) {
  let before = "";
  let after = "";
  const checklistItems = state.checklistItems.map((item) => {
    if (item.id !== itemId) return item;
    before = item.adminReviewStatus;
    const next = update(item);
    after = next.adminReviewStatus;
    return next;
  });

  return {
    ...state,
    checklistItems,
    auditLogs: [...state.auditLogs, audit(actorId, action, "checklist", itemId, before, after, detail)]
  };
}

function updateIssue(
  state: AdminDashboardState,
  issueId: string,
  actorId: string,
  action: string,
  detail: string,
  update: (issue: Issue) => Issue
) {
  let before = "";
  let after = "";
  const issues = state.issues.map((issue) => {
    if (issue.id !== issueId) return issue;
    before = `${issue.status}:${issue.assignedTo}`;
    const next = update(issue);
    after = `${next.status}:${next.assignedTo}`;
    return next;
  });

  return {
    ...state,
    issues,
    auditLogs: [...state.auditLogs, audit(actorId, action, "issue", issueId, before, after, detail)]
  };
}

export function getAdminDashboardState(state: AdminDashboardState) {
  return state;
}

export function getAdminDashboardSummary(state: AdminDashboardState): AdminDashboardSummary {
  const totalChecklist = state.checklistItems.length;
  const completedChecklist = state.checklistItems.filter((item) => item.status === "completed").length;
  const lateChecklist = state.checklistItems.filter((item) => item.status === "late" || item.status === "issue").length;
  const pendingChecklist = totalChecklist - completedChecklist;
  const issueCount = state.issues.filter((issue) => issue.status !== "closed").length;
  const stockAlerts = state.stockItems.filter((item) => item.status !== "normal").length;
  const staffOnline = state.staff.filter((staff) => staff.status !== "shift_closed").length;

  return {
    totalChecklist,
    completedChecklist,
    pendingChecklist,
    lateChecklist,
    pendingOrders: state.saleSummary.pendingOrderCount,
    issueCount,
    stockAlerts,
    staffOnline,
    completionRate: totalChecklist > 0 ? Math.round((completedChecklist / totalChecklist) * 100) : 0
  };
}

export function getFinishTaskGroups(state: AdminDashboardState): FinishTaskGroup[] {
  const dailyTasks: FinishTask[] = state.checklistItems.map((item) => ({
    id: `daily-${item.id}`,
    title: item.title,
    schedule: "daily",
    dueLabel: "วันนี้",
    dueDate: state.workDate,
    completed: item.status === "completed",
    completedAt: item.completedAt,
    owner: item.assignedTo,
    category: item.category
  }));

  const groups: Array<{ id: FinishTask["schedule"]; title: string; dueLabel: string; tasks: FinishTask[] }> = [
    { id: "daily", title: "Daily", dueLabel: "วันนี้", tasks: dailyTasks },
    { id: "weekly", title: "Weekly", dueLabel: "ครบกำหนดสัปดาห์นี้", tasks: state.finishTasks.filter((task) => task.schedule === "weekly") },
    { id: "monthly", title: "Monthly", dueLabel: "ครบกำหนดเดือนนี้", tasks: state.finishTasks.filter((task) => task.schedule === "monthly") }
  ];

  return groups.map((group) => {
    const tasks = group.tasks;
    return {
      ...group,
      total: tasks.length,
      completed: tasks.filter((task) => task.completed).length,
      tasks
    };
  });
}

export function getDailyTaskStatusSummary(state: AdminDashboardState): DailyTaskStatusSummary {
  return state.checklistItems.reduce(
    (summary, item) => {
      if (item.status === "completed" && !isCompletedLate(item)) {
        return { ...summary, onTime: summary.onTime + 1 };
      }
      if (item.status === "completed" || item.status === "late" || item.status === "issue") {
        return { ...summary, late: summary.late + 1 };
      }
      return { ...summary, missed: summary.missed + 1 };
    },
    { total: state.checklistItems.length, onTime: 0, late: 0, missed: 0 }
  );
}

export function getChecklistIssues(state: AdminDashboardState): ChecklistIssueSummary[] {
  return state.checklistItems
    .filter(
      (item) =>
        item.status === "late" ||
        item.status === "issue" ||
        isCompletedLate(item) ||
        item.followUp ||
        item.adminReviewStatus === "correction_requested"
    )
    .map((item) => ({
      checklistId: item.id,
      title: item.title,
      category: item.category,
      assignedTo: item.assignedTo,
      severity: item.status === "issue" || item.adminReviewStatus === "correction_requested" ? "high" : "medium",
      reason: item.correctionReason || item.note || (isCompletedLate(item) ? "เสร็จช้ากว่ากำหนด" : "ต้องติดตามจาก checklist"),
      dueAt: item.dueAt
    }));
}

export function updateChecklistStatus(state: AdminDashboardState, itemId: string, status: ChecklistItem["status"], actorId: string) {
  return updateChecklistItem(state, itemId, actorId, "update_checklist_status", `เปลี่ยนสถานะเป็น ${status}`, (item) => ({
    ...item,
    status
  }));
}

export function approveChecklistItem(state: AdminDashboardState, itemId: string, actorId: string) {
  return updateChecklistItem(state, itemId, actorId, "approve_checklist", "อนุมัติ checklist", (item) => ({
    ...item,
    adminReviewStatus: "approved",
    correctionReason: undefined,
    followUp: false
  }));
}

export function requestCorrection(state: AdminDashboardState, itemId: string, actorId: string, reason: string) {
  return updateChecklistItem(state, itemId, actorId, "request_correction", reason, (item) => ({
    ...item,
    adminReviewStatus: "correction_requested",
    correctionReason: reason,
    followUp: true
  }));
}

export function markChecklistFollowUp(state: AdminDashboardState, itemId: string, actorId: string) {
  return updateChecklistItem(state, itemId, actorId, "mark_follow_up", "ทำเครื่องหมาย follow up", (item) => ({
    ...item,
    adminReviewStatus: "follow_up_required",
    followUp: true
  }));
}

export function createIssue(state: AdminDashboardState, issue: Issue, actorId: string) {
  return {
    ...state,
    issues: [...state.issues, issue],
    auditLogs: [...state.auditLogs, audit(actorId, "create_issue", "issue", issue.id, "none", issue.status, issue.title)]
  };
}

export function assignIssue(state: AdminDashboardState, issueId: string, assignedTo: string, actorId: string) {
  return updateIssue(state, issueId, actorId, "assign_issue", `มอบหมายให้ ${assignedTo}`, (issue) => ({
    ...issue,
    assignedTo,
    status: issue.status === "open" ? "in_progress" : issue.status
  }));
}

export function resolveIssue(state: AdminDashboardState, issueId: string, actorId: string) {
  return updateIssue(state, issueId, actorId, "resolve_issue", "ปิด issue", (issue) => ({
    ...issue,
    status: "closed" as IssueStatus,
    notes: [...issue.notes, "Resolved by admin"]
  }));
}

export function addIssueNote(state: AdminDashboardState, issueId: string, note: string, actorId: string) {
  return updateIssue(state, issueId, actorId, "add_issue_note", note, (issue) => ({
    ...issue,
    notes: [...issue.notes, note]
  }));
}

export function approveDailyClosing(state: AdminDashboardState, actorId: string) {
  return {
    ...state,
    adminReviews: [
      ...state.adminReviews,
      {
        id: `review-closing-${Date.now()}`,
        targetType: "closing",
        targetId: state.workDate,
        status: "approved" as AdminReviewStatus,
        reviewerId: actorId,
        note: "อนุมัติปิดยอดประจำวัน",
        updatedAt: new Date().toISOString()
      }
    ],
    auditLogs: [
      ...state.auditLogs,
      audit(actorId, "approve_daily_closing", "closing", state.workDate, "waiting_review", "approved", "อนุมัติปิดยอดประจำวัน")
    ]
  };
}
