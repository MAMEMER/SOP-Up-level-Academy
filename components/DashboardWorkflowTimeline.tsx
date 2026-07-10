"use client";

import { useEffect, useState } from "react";
import type { WorkflowPhase } from "../lib/card-store-workflow.ts";
import {
  formatWorkDate,
  phaseScheduleForWorkDate,
  readWorkflowRecordsFromStorage,
  upsertWorkflowRecord,
  workflowStorageKey,
  workflowVisualStatus,
  type WorkflowDailyRecord
} from "../lib/workflow-records.ts";

export function DashboardWorkflowTimeline({ phases }: { phases: WorkflowPhase[] }) {
  const [records, setRecords] = useState<WorkflowDailyRecord[]>([]);
  const workDate = formatWorkDate();

  useEffect(() => {
    const storedRecords = readWorkflowRecordsFromStorage(window.localStorage);
    const now = new Date();
    const recordsWithMissed = phases.reduce((current, phase) => {
      const existing = current.find((item) => item.workDate === workDate && item.phaseId === phase.id);
      if (existing?.status === "submitted" || existing?.status === "missed") return current;

      const schedule = phaseScheduleForWorkDate(phase.id, workDate);
      if (Date.parse(schedule.dueAt) >= now.getTime()) return current;

      return upsertWorkflowRecord(current, {
        workDate,
        phaseId: phase.id,
        phaseTitle: phase.title,
        completed: existing?.completed || 0,
        total: phase.checklist.length,
        status: "missed",
        recordedAt: now.toISOString(),
        startedAt: existing?.startedAt,
        dueAt: schedule.dueAt,
        scheduleStartAt: schedule.startAt,
        scheduleEndAt: schedule.endAt,
        checkedKeys: existing?.checkedKeys || []
      });
    }, storedRecords);

    setRecords(recordsWithMissed);
    if (recordsWithMissed !== storedRecords) {
      window.localStorage.setItem(workflowStorageKey, JSON.stringify(recordsWithMissed));
    }
  }, [phases, workDate]);

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
