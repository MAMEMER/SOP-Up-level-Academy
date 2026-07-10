import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mockAdminDashboardState } from "../lib/admin-dashboard-data.ts";
import {
  approveChecklistItem,
  assignIssue,
  getChecklistIssues,
  getDailyTaskStatusSummary,
  getFinishTaskGroups,
  getAdminDashboardSummary,
  markChecklistFollowUp,
  requestCorrection,
  resolveIssue
} from "../lib/admin-dashboard-store.ts";

describe("admin dashboard store", () => {
  it("summarizes owner dashboard health metrics", () => {
    const summary = getAdminDashboardSummary(mockAdminDashboardState);

    assert.equal(summary.totalChecklist, 18);
    assert.equal(summary.completedChecklist, 10);
    assert.equal(summary.pendingChecklist, 8);
    assert.equal(summary.lateChecklist, 3);
    assert.equal(summary.pendingOrders, 8);
    assert.equal(summary.issueCount, 5);
    assert.equal(summary.stockAlerts, 7);
    assert.equal(summary.staffOnline, 4);
    assert.equal(summary.completionRate, 56);
  });

  it("groups finish tasks by daily, weekly, and monthly schedule", () => {
    const groups = getFinishTaskGroups(mockAdminDashboardState);

    assert.deepEqual(groups.map((group) => group.id), ["daily", "weekly", "monthly"]);
    assert.equal(groups[0].total, 18);
    assert.equal(groups[0].completed, 10);
    assert.equal(groups[0].dueLabel, "วันนี้");
    assert.equal(groups[1].title, "Weekly");
    assert.equal(groups[1].dueLabel, "ครบกำหนดสัปดาห์นี้");
    assert.equal(groups[2].title, "Monthly");
    assert.equal(groups[2].dueLabel, "ครบกำหนดเดือนนี้");
  });

  it("summarizes daily task status into on-time, late, and missed buckets", () => {
    const taskSummary = getDailyTaskStatusSummary(mockAdminDashboardState);

    assert.equal(taskSummary.total, 18);
    assert.equal(taskSummary.onTime, 8);
    assert.equal(taskSummary.late, 5);
    assert.equal(taskSummary.missed, 5);
  });

  it("derives operation issues from checklist rows", () => {
    const checklistIssues = getChecklistIssues(mockAdminDashboardState);

    assert.equal(checklistIssues.length, 5);
    assert.equal(checklistIssues[0].checklistId, "check-online-replies");
    assert.equal(checklistIssues.some((issue) => issue.checklistId === "check-pack-shopee"), true);
  });

  it("approves a checklist item and writes an audit log", () => {
    const next = approveChecklistItem(mockAdminDashboardState, "check-open-cash", "owner-1");
    const item = next.checklistItems.find((entry) => entry.id === "check-open-cash");

    assert.equal(item?.adminReviewStatus, "approved");
    assert.equal(item?.followUp, false);
    assert.equal(next.auditLogs.at(-1)?.action, "approve_checklist");
    assert.equal(next.auditLogs.at(-1)?.targetId, "check-open-cash");
  });

  it("requests correction with a reason and writes an audit log", () => {
    const next = requestCorrection(mockAdminDashboardState, "check-stock-showcase", "owner-1", "ถ่ายรูปตู้โชว์ไม่ครบ");
    const item = next.checklistItems.find((entry) => entry.id === "check-stock-showcase");

    assert.equal(item?.adminReviewStatus, "correction_requested");
    assert.equal(item?.correctionReason, "ถ่ายรูปตู้โชว์ไม่ครบ");
    assert.equal(next.auditLogs.at(-1)?.action, "request_correction");
  });

  it("marks checklist follow up and writes an audit log", () => {
    const next = markChecklistFollowUp(mockAdminDashboardState, "check-online-replies", "owner-1");
    const item = next.checklistItems.find((entry) => entry.id === "check-online-replies");

    assert.equal(item?.followUp, true);
    assert.equal(item?.adminReviewStatus, "follow_up_required");
    assert.equal(next.auditLogs.at(-1)?.action, "mark_follow_up");
  });

  it("assigns and resolves an issue with audit logs", () => {
    const assigned = assignIssue(mockAdminDashboardState, "issue-missing-tracking", "staff-nam", "owner-1");
    const assignedIssue = assigned.issues.find((issue) => issue.id === "issue-missing-tracking");
    assert.equal(assignedIssue?.assignedTo, "staff-nam");
    assert.equal(assigned.auditLogs.at(-1)?.action, "assign_issue");

    const resolved = resolveIssue(assigned, "issue-missing-tracking", "owner-1");
    const resolvedIssue = resolved.issues.find((issue) => issue.id === "issue-missing-tracking");
    assert.equal(resolvedIssue?.status, "closed");
    assert.equal(resolved.auditLogs.at(-1)?.action, "resolve_issue");
  });
});
