import type { ChecklistEvent } from "./performance-score.ts";

// Admin-entered checklist audits — the manual half of the Checklist KPI category.
//
// The automatic half (missing_day) is derived from the submitted work records: a scheduled
// + clocked-in day with no submission. It cannot see whether what WAS submitted is true, so
// the "สุ่มตรวจแล้วข้อมูลไม่ตรงจริง" (-10 + coach) and "ข้ามข้อสำคัญ" (-2) events had no way
// in — the engine supported them but nothing ever produced one. This is that input.
//
// Storage lives in lib/checklist-audit-store.ts (service account, same reason as stock
// checks). This half stays free of server-only imports so the conversion is unit-testable.

export const CHECKLIST_AUDIT_COLLECTION = "sop_checklist_audits";

/** The manual checklist events the KPI engine scores (missing_day is derived, backfill is 0). */
export type ChecklistAuditType = "false_record" | "missing_important";

export const checklistAuditTypeOptions: Array<{ value: ChecklistAuditType; label: string; hint: string }> = [
  { value: "false_record", label: "สุ่มตรวจไม่เจอ / ข้อมูลไม่ตรงจริง", hint: "หัก 10 คะแนนต่อครั้ง + ติดธง coach 4 สัปดาห์" },
  { value: "missing_important", label: "ข้ามข้อสำคัญใน checklist", hint: "หัก 2 คะแนนต่อครั้ง" }
];

export type ChecklistAuditRecord = {
  id: string;
  /** the day that was audited (not the day it was recorded) */
  workDate: string;
  /** staff code of whoever submitted that checklist */
  employeeName: string;
  type: ChecklistAuditType;
  count: number;
  /** what was checked and what did not match */
  note: string;
  /** photo of the real shelf/screen, or a link to it */
  evidence?: string;
  recordedAt: string;
  recordedBy: string;
};

export type ChecklistAuditRecordInput = Omit<ChecklistAuditRecord, "id" | "recordedAt">;

function auditRecordId(input: { workDate: string; employeeName: string; type: string }, recordedAt: string) {
  return `audit-${input.workDate}-${input.employeeName}-${input.type}-${recordedAt}`.replace(/[^a-zA-Z0-9-]/g, "-");
}

export function buildChecklistAuditRecord(input: ChecklistAuditRecordInput, recordedAt = new Date().toISOString()): ChecklistAuditRecord {
  return {
    ...input,
    count: Math.max(1, Math.round(input.count || 1)),
    note: input.note.trim(),
    evidence: (input.evidence || "").trim() || undefined,
    recordedAt,
    id: auditRecordId(input, recordedAt)
  };
}

export function checklistAuditRecordsForDate(records: ChecklistAuditRecord[], workDate: string) {
  return records.filter((record) => record.workDate === workDate);
}

/**
 * Groups the audits into the events the engine scores. Same shape as the complaint
 * conversion: one event per employee+type, counts summed, source "manual".
 */
export function checklistAuditRecordsToEvents(records: ChecklistAuditRecord[]): Array<{ employeeName: string; event: ChecklistEvent }> {
  const grouped = new Map<string, { employeeName: string; event: ChecklistEvent }>();
  records.forEach((record) => {
    const key = `${record.employeeName}:${record.type}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.event.count += Math.max(1, Math.round(record.count || 1));
      return;
    }
    grouped.set(key, {
      employeeName: record.employeeName,
      event: { type: record.type, count: Math.max(1, Math.round(record.count || 1)), source: "manual" }
    });
  });
  return [...grouped.values()].sort((left, right) => `${left.employeeName}:${left.event.type}`.localeCompare(`${right.employeeName}:${right.event.type}`));
}
