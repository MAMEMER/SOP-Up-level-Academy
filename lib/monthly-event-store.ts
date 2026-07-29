// ที่เก็บสถานะงานประจำเดือน (Monthly tasks) — ใช้ร่วมกันระหว่าง Dashboard กับหน้า /monthly-tasks
//
// เดิมเก็บใน localStorage และถูกปิดด้วย canPersistWorkflowRecords → กดแล้วไม่บันทึกจริง
// ตอนนี้เก็บบน server ผ่าน /api/work-records (scope monthly, owner team) เพราะเป็นงานที่
// ทั้งทีมช่วยกันทำในรอบเดือน และเจ้าของร้านต้องเห็นสถานะเดียวกับพนักงาน

"use client";

import type { MonthlyTaskState } from "./monthly-event-tasks.ts";
import { fetchWorkRecordRange, saveWorkRecord } from "./work-records-client.ts";
import { monthlyScopeKey } from "./work-records.ts";

export type MonthlyEventPayload = {
  states: Record<string, MonthlyTaskState>;
  evidence: Record<string, string>;
};

const validStates: MonthlyTaskState[] = ["not_started", "in_progress", "submitted", "done"];

/** All monthly-task state lives in one team document per calendar month. */
export function monthlyEventScopeKey(monthKey: string) {
  return monthlyScopeKey(monthKey);
}

export async function fetchMonthlyEventPayload(monthKey: string): Promise<MonthlyEventPayload> {
  const scopeKey = monthlyEventScopeKey(monthKey);
  const result = await fetchWorkRecordRange("monthly", scopeKey, scopeKey, { owner: "team" });
  const data = (result.records.find((record) => record.scopeKey === scopeKey)?.data || {}) as Partial<MonthlyEventPayload>;

  const states: Record<string, MonthlyTaskState> = {};
  for (const [key, value] of Object.entries(data.states || {})) {
    if (validStates.includes(value as MonthlyTaskState)) states[key] = value as MonthlyTaskState;
  }
  return { states, evidence: data.evidence || {} };
}

export async function saveMonthlyEventPayload(monthKey: string, payload: MonthlyEventPayload): Promise<void> {
  await saveWorkRecord("monthly", monthlyEventScopeKey(monthKey), payload, "team");
}
