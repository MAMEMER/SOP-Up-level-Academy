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
  // (กะ1-only) flagged late. Admin → all phases. Off day → all phases but muted (offDay).
  const { phases: shiftPhases, offDay, offLabel } = useShiftPhases(phases, staffCode, branch, workDate);

  return (
    <div className={`hero-metrics checklist-status-cards${offDay ? " is-off-day" : ""}`}>
      {offDay && offLabel ? (
        <p className="checklist-offday-note">{offLabel} · แสดงเป็นข้อมูลอ้างอิง ไม่นับว่าเลยเวลา</p>
      ) : null}
      {shiftPhases.map((phase) => {
        const record = records.find((item) => item.workDate === workDate && item.phaseId === phase.id);
        // On a day off, don't colour the card from the records (that is what caused the
        // false "เกินเวลา / เลยเวลา" alerts) — show it muted and neutral instead.
        const color = offDay ? "white" : workflowVisualStatus(records, workDate, phase.id);
        return (
          <a
            key={phase.id}
            href={`/checklist#${phase.id}`}
            className={`board-stat checklist-status status-${color}${offDay ? " is-muted" : ""}`}
          >
            <span>{phase.title}</span>
            <strong>{offDay ? "วันหยุด" : statusText[color]}</strong>
            <small>{record ? `${record.completed}/${record.total}` : `0/${phase.checklist.length}`}</small>
          </a>
        );
      })}
    </div>
  );
}
