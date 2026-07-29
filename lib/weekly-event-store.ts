// ที่เก็บ state ของ checklist งานกิจกรรมประจำสัปดาห์ (Gym Pokémon ฯลฯ)
//
// เดิมเก็บใน localStorage → ติดอยู่ในเบราว์เซอร์เครื่องเดียว พนักงานคนละกะเห็นคนละชุด
// และเจ้าของร้านไม่เห็นเลย. ตอนนี้เก็บบน server ผ่าน /api/work-records (scope weekly,
// owner team) — เป็นงานที่ทั้งทีมช่วยกันทำในสัปดาห์นั้น จึงใช้ record เดียวร่วมกัน
// แยกตาม ISO week → ขึ้นสัปดาห์ใหม่ checklist reset อัตโนมัติเหมือนเดิม

"use client";

import { isoWeekKey } from "./periodic-tasks.ts";
import { fetchWorkRecordRange, saveWorkRecord } from "./work-records-client.ts";
import { weeklyScopeKey } from "./work-records.ts";

export type WeeklyEventPayload = {
  ticks: Record<string, boolean>;
  data: Record<string, string>;
  submitted: Record<string, boolean>;
};

export const emptyWeeklyEventPayload: WeeklyEventPayload = { ticks: {}, data: {}, submitted: {} };

export function weeklyEventPeriodKey(workDate: string): string {
  return isoWeekKey(workDate);
}

function scope(periodKey: string, eventId: string): string {
  return `${periodKey}:${eventId}`;
}

export function tickKey(periodKey: string, eventId: string, itemId: string): string {
  return `${scope(periodKey, eventId)}:${itemId}`;
}

export function fieldKey(periodKey: string, eventId: string, itemId: string, field: string): string {
  return `${scope(periodKey, eventId)}:${itemId}.${field}`;
}

export function submitKey(periodKey: string, eventId: string): string {
  return scope(periodKey, eventId);
}

/** Weekly EVENT state lives beside the weekly stock record, under its own scope key. */
function eventScopeKey(periodKey: string) {
  return `${weeklyScopeKey(periodKey)}-event`;
}

export async function fetchWeeklyEventPayload(periodKey: string): Promise<WeeklyEventPayload> {
  const scopeKey = eventScopeKey(periodKey);
  const result = await fetchWorkRecordRange("weekly", scopeKey, scopeKey, { owner: "team" });
  const data = (result.records.find((record) => record.scopeKey === scopeKey)?.data || {}) as Partial<WeeklyEventPayload>;
  return {
    ticks: data.ticks || {},
    data: data.data || {},
    submitted: data.submitted || {}
  };
}

export async function saveWeeklyEventPayload(periodKey: string, payload: WeeklyEventPayload): Promise<void> {
  await saveWorkRecord("weekly", eventScopeKey(periodKey), payload, "team");
}
