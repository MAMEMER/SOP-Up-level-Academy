"use client";

import type { WorkflowPhase } from "../lib/card-store-workflow.ts";
import { formatWorkDate, workflowVisualStatus } from "../lib/workflow-records.ts";
import { useWorkflowRecords } from "../lib/workflow-records-client.ts";
import { useShiftPhases } from "../lib/use-shift-phases.ts";

const statusText = {
  white: "ยังไม่เริ่ม",
  green: "ตรงเวลา",
  orange: "เกินเวลา",
  red: "ยังไม่เสร็จ",
  purple: "ต่อเนื่อง 3 วัน"
};

export function DashboardChecklistStatus({
  phases,
  staffCode = null,
  branch
}: {
  phases: WorkflowPhase[];
  /** The staffer this dashboard belongs to — used to show only their กะ's daily หัวข้อ. */
  staffCode?: string | null;
  branch?: string;
}) {
  const { records } = useWorkflowRecords();
  const workDate = formatWorkDate();
  // Only the หัวข้อ for this person's rostered กะ — so a กะ2 staffer never sees เปิดร้าน
  // (กะ1-only) flagged late. Admin / off-day → all phases (hook returns them unfiltered).
  const shiftPhases = useShiftPhases(phases, staffCode, branch, workDate);

  return (
    <div className="hero-metrics checklist-status-cards">
      {shiftPhases.map((phase) => {
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
