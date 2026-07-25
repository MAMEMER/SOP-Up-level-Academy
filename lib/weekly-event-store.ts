// ที่เก็บสถานะงานประจำสัปดาห์ (Weekly event tasks) ฝั่ง client
// ใช้ localStorage ร่วมกันระหว่าง Dashboard กับหน้า checklist /weekly-tasks
// ปัจจุบันระบบยังอยู่โหมดทดลอง (canPersistWorkflowRecords = false) → อ่านได้ว่าง
// เมื่อเปิดใช้งานจริงจะบันทึกลง localStorage และซิงก์ทั้งสองหน้า

import { canPersistWorkflowRecords } from "./workflow-records.ts";

export const weeklyEventDoneStorageKey = "up-level-weekly-event-done";
export const weeklyEventEvidenceStorageKey = "up-level-weekly-event-evidence";

function safeParse(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function readWeeklyEventDoneKeys(): Set<string> {
  if (typeof window === "undefined" || !canPersistWorkflowRecords()) return new Set();
  const map = safeParse(window.localStorage.getItem(weeklyEventDoneStorageKey));
  return new Set(Object.keys(map).filter((key) => map[key] === "done"));
}

export function readWeeklyEventEvidence(): Record<string, string> {
  if (typeof window === "undefined" || !canPersistWorkflowRecords()) return {};
  return safeParse(window.localStorage.getItem(weeklyEventEvidenceStorageKey));
}

export function persistWeeklyEventDone(doneKeys: Set<string>) {
  if (typeof window === "undefined" || !canPersistWorkflowRecords()) return;
  const map: Record<string, string> = {};
  for (const key of doneKeys) map[key] = "done";
  window.localStorage.setItem(weeklyEventDoneStorageKey, JSON.stringify(map));
}

export function persistWeeklyEventEvidence(evidence: Record<string, string>) {
  if (typeof window === "undefined" || !canPersistWorkflowRecords()) return;
  window.localStorage.setItem(weeklyEventEvidenceStorageKey, JSON.stringify(evidence));
}

export function weeklyTasksSubmitHref(taskId?: string) {
  return taskId ? `/weekly-tasks#${taskId}` : "/weekly-tasks";
}
