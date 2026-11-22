import { test } from "node:test";
import assert from "node:assert/strict";
import { personNumbers } from "../lib/kpi-v2-person-numbers.ts";
import type { WorkProject } from "../lib/work-projects.ts";

const base = { targets: {}, projects: [] };
test("excludes missing targets and caps each available achievement", () => {
  assert.deepEqual(personNumbers("A", "2026-12", base), {});
  assert.deepEqual(personNumbers("A", "2026-12", { ...base, teachCount: 15, addonSales: 50, targets: { teachTarget: 10, addonSalesTarget: 100 } }), { group12: 75 });
  assert.deepEqual(personNumbers("A", "2026-12", { ...base, teachCount: 0, targets: { teachTarget: 10 } }), { group12: 0 });
});
test("assigned work counts passed and on-time submissions against the target", () => {
  const project = { id: "a", branch: "bangkae", title: "Task", startDate: "2026-12-01", endDate: "2026-12-05", assignees: ["A"], status: "done", createdBy: "owner", createdAt: "", updatedAt: "", progress: [], reviews: [{ id: "r", assignee: "A", outcome: "ontime_pass", dueDate: "2026-12-05", submittedDate: "2026-12-05", daysLate: 0, points: 0, confirmedBy: "owner", confirmedAt: "2026-12-06" }] } satisfies WorkProject;
  assert.deepEqual(personNumbers("A", "2026-12", { ...base, projects: [project], targets: { assignedOnTimeTarget: 80 } }), { group22: 100 });
  assert.deepEqual(personNumbers("A", "2026-11", { ...base, projects: [project], targets: { assignedOnTimeTarget: 80 } }), {});
  const late = { ...project, id: "late", reviews: [{ ...project.reviews[0], outcome: "late" as const, submittedDate: "2026-12-06" }] };
  const waiting = { ...project, id: "waiting", reviews: [] };
  const score = personNumbers("A", "2026-12", { ...base, projects: [project, late, waiting], targets: { assignedOnTimeTarget: 100 } }).group22;
  assert.ok(score !== undefined && Math.abs(score - 100 / 3) < 1e-9);
});
