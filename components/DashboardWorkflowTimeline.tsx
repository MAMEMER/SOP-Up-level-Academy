"use client";

import type { WorkflowPhase } from "../lib/card-store-workflow.ts";
import { formatWorkDate, workflowVisualStatus } from "../lib/workflow-records.ts";
import { useWorkflowRecords } from "../lib/workflow-records-client.ts";

// Read-only tile strip. Past-due phases already read as "red" from workflowVisualStatus,
// so the timeline no longer writes "missed" records itself — the checklist owns writes.
export function DashboardWorkflowTimeline({ phases }: { phases: WorkflowPhase[] }) {
  const { records } = useWorkflowRecords();
  const workDate = formatWorkDate();

  return (
    <section className="workflow-timeline">
      {phases.map((phase, index) => {
        const visualStatus = workflowVisualStatus(records, workDate, phase.id);
        const submitted = records.find(
          (item) => item.workDate === workDate && item.phaseId === phase.id && item.status === "submitted"
        );

        return (
          <a
            key={phase.id}
            href={`/checklist#${phase.id}`}
            className={`workflow-tile phase-${phase.category} workflow-status-${visualStatus}`}
          >
            <span className="phase-icon">{submitted ? "✓" : String(index + 1).padStart(2, "0")}</span>
            <div>
              <p>{String(index + 1).padStart(2, "0")} · {phase.timeLabel}</p>
              <strong>{phase.title}</strong>
              <small>{phase.goal}</small>
            </div>
            <em>{phase.checklist.length} checklist</em>
          </a>
        );
      })}
    </section>
  );
}
