"use client";

import { useEffect, useState } from "react";
import type { WorkflowPhase } from "../lib/card-store-workflow.ts";
import { formatWorkDate, readWorkflowRecordsFromStorage, workflowVisualStatus, type WorkflowDailyRecord } from "../lib/workflow-records.ts";

const statusText = {
  white: "ยังไม่เริ่ม",
  green: "ตรงเวลา",
  orange: "เกินเวลา",
  red: "ยังไม่เสร็จ",
  purple: "ต่อเนื่อง 3 วัน"
};

export function DashboardChecklistStatus({ phases }: { phases: WorkflowPhase[] }) {
  const [records, setRecords] = useState<WorkflowDailyRecord[]>([]);
  const workDate = formatWorkDate();

  useEffect(() => {
    setRecords(readWorkflowRecordsFromStorage(window.localStorage));
  }, []);

  return (
    <div className="hero-metrics checklist-status-cards">
      {phases.map((phase) => {
        const record = records.find((item) => item.workDate === workDate && item.phaseId === phase.id);
        const color = workflowVisualStatus(records, workDate, phase.id);
        return (
          <a key={phase.id} href={`/checklist#${phase.id}`} className={`board-stat checklist-status status-${color}`}>
            <span>{phase.title}</span>
            <strong>{statusText[color]}</strong>
            <small>{record ? `${record.completed}/${record.total}` : `0/${phase.checklist.length}`}</small>
          </a>
        );
      })}
    </div>
  );
}
