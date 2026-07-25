// ที่เก็บสถานะงานประจำเดือน (Monthly tasks) ฝั่ง client
// ใช้ localStorage ร่วมกันระหว่าง Dashboard กับหน้า checklist /monthly-tasks
// ปัจจุบันระบบยังอยู่โหมดทดลอง (canPersistWorkflowRecords = false) → อ่านได้ว่าง (ทุกงาน = ยังไม่เริ่ม)
// เมื่อเปิดใช้งานจริงจะบันทึกลง localStorage และซิงก์ทั้งสองหน้า

import { canPersistWorkflowRecords } from "./workflow-records.ts";
import type { MonthlyTaskState } from "./monthly-event-tasks.ts";

export const monthlyEventStateStorageKey = "up-level-monthly-event-state";
export const monthlyEventEvidenceStorageKey = "up-level-monthly-event-evidence";

const validStates: MonthlyTaskState[] = ["not_started", "in_progress", "submitted", "done"];

function safeParse(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function readMonthlyEventStates(): Record<string, MonthlyTaskState> {
  if (typeof window === "undefined" || !canPersistWorkflowRecords()) return {};
  const map = safeParse(window.localStorage.getItem(monthlyEventStateStorageKey));
  const result: Record<string, MonthlyTaskState> = {};
  for (const [key, value] of Object.entries(map)) {
    if (validStates.includes(value as MonthlyTaskState)) result[key] = value as MonthlyTaskState;
  }
  return result;
}

export function readMonthlyEventEvidence(): Record<string, string> {
  if (typeof window === "undefined" || !canPersistWorkflowRecords()) return {};
  return safeParse(window.localStorage.getItem(monthlyEventEvidenceStorageKey));
}

export function persistMonthlyEventStates(states: Record<string, MonthlyTaskState>) {
  if (typeof window === "undefined" || !canPersistWorkflowRecords()) return;
  window.localStorage.setItem(monthlyEventStateStorageKey, JSON.stringify(states));
}

export function persistMonthlyEventEvidence(evidence: Record<string, string>) {
  if (typeof window === "undefined" || !canPersistWorkflowRecords()) return;
  window.localStorage.setItem(monthlyEventEvidenceStorageKey, JSON.stringify(evidence));
}
