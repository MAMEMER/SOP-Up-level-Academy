import { test } from "node:test";
import assert from "node:assert/strict";
import { personNumbers } from "../lib/kpi-v2-person-numbers.ts";
import type { WorkProject } from "../lib/work-projects.ts";

const base = { targets: {}, projects: [] };
test("excludes missing targets and caps each available achievement", () => {
  assert.deepEqual(personNumbers("A", "2026-12", base), {});
  assert.deepEqual(personNumbers("A", "2026-12", { ...base, teachCount: 15, productSales: 50, productTarget: 100, targets: { teachTarget: 10 } }), { advanced: 100, revenueOwn: 50 });
  assert.deepEqual(personNumbers("A", "2026-12", { ...base, teachCount: 0, targets: { teachTarget: 10 } }), { advanced: 0 });
});
test("assigned work counts passed and on-time submissions against the target", () => {
  const project = { id: "a", branch: "bangkae", title: "Task", startDate: "2026-12-01", endDate: "2026-12-05", assignees: ["A"], status: "done", createdBy: "owner", createdAt: "", updatedAt: "", progress: [], reviews: [{ id: "r", assignee: "A", outcome: "ontime_pass", dueDate: "2026-12-05", submittedDate: "2026-12-05", daysLate: 0, points: 0, confirmedBy: "owner", confirmedAt: "2026-12-06" }] } satisfies WorkProject;
  assert.deepEqual(personNumbers("A", "2026-12", { ...base, projects: [project], targets: { assignedOnTimeTarget: 80 } }), { advanced: 100 });
  assert.deepEqual(personNumbers("A", "2026-11", { ...base, projects: [project], targets: { assignedOnTimeTarget: 80 } }), {});
  const late = { ...project, id: "late", reviews: [{ ...project.reviews[0], outcome: "late" as const, submittedDate: "2026-12-06" }] };
  const waiting = { ...project, id: "waiting", reviews: [] };
  const score = personNumbers("A", "2026-12", { ...base, projects: [project, late, waiting], targets: { assignedOnTimeTarget: 100 } }).advanced;
  assert.ok(score !== undefined && Math.abs(score - 100 / 3) < 1e-9);
});

test("revenue weights available metrics and renormalizes missing targets", () => {
  assert.deepEqual(personNumbers("A", "2026-12", { ...base, productSales: 50, productTarget: 100, members: 1, eventCustomers: 0, targets: { memberTarget: 1, eventTarget: 1 } }), { revenueOwn: 50 });
  assert.deepEqual(personNumbers("A", "2026-12", { ...base, productSales: 50, productTarget: 100, members: 1, targets: { memberTarget: 1 } }), { revenueOwn: 200 / 3 });
});
