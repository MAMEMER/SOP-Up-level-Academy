// ที่เก็บ state ของ checklist งานกิจกรรมประจำสัปดาห์ (Gym Pokémon, Lorcana ฯลฯ)
//
// เดิมเก็บใน localStorage → ติดอยู่ในเบราว์เซอร์เครื่องเดียว พนักงานคนละกะเห็นคนละชุด
// และเจ้าของร้านไม่เห็นเลย. ตอนนี้เก็บบน server ผ่าน /api/work-records (scope weekly,
// owner team) — เป็นงานที่ทั้งทีมช่วยกันทำในวันจัดกิจกรรม จึงใช้ record เดียวร่วมกัน
//
// สำคัญ: checklist นี้คือ "งานของวันจัดกิจกรรม" (event day) — reset ราย "วัน" ไม่ใช่ราย "สัปดาห์"
// เกมที่จัดหลายวันต่อสัปดาห์ (Lorcana จัด พุธ–อาทิตย์, Gym Pokemon จัด อังคาร/ศุกร์/เสาร์)
// ต้องเริ่ม checklist ใหม่ทุกวันจัดกิจกรรม. เดิมคีย์ตาม ISO week → checklist ที่ทำวันศุกร์
// ยังค้างมาให้เห็นวันเสาร์/อาทิตย์ในสัปดาห์เดียวกัน (ไม่ reset). ตอนนี้คีย์ตามวันทำงาน
// (YYYY-MM-DD ตามเวลาไทย) → ขึ้นวันใหม่ checklist reset อัตโนมัติ

"use client";

import { fetchWorkRecordRange, saveWorkRecord } from "./work-records-client.ts";
import { weeklyScopeKey } from "./work-records.ts";
import { weeklyEventScopeKeyPart, weeklyEventTickKey, weeklyEventSubmitKey } from "./weekly-event-tasks.ts";

export type WeeklyEventPayload = {
  ticks: Record<string, boolean>;
  data: Record<string, string>;
  submitted: Record<string, boolean>;
};

export const emptyWeeklyEventPayload: WeeklyEventPayload = { ticks: {}, data: {}, submitted: {} };

// คีย์ช่วงเวลาของ checklist วันกิจกรรม = "วันทำงาน" (YYYY-MM-DD) ไม่ใช่ ISO week
// → แต่ละวันจัดกิจกรรมมี checklist ของตัวเอง และ reset เมื่อขึ้นวันใหม่
export function weeklyEventPeriodKey(workDate: string): string {
  return workDate;
}

// รูปแบบคีย์อยู่ใน weekly-event-tasks.ts (server-safe) เพื่อให้ owner ops summary อ่านได้ตรงกัน
export const tickKey = weeklyEventTickKey;
export const submitKey = weeklyEventSubmitKey;

export function fieldKey(periodKey: string, eventId: string, itemId: string, field: string): string {
  return `${weeklyEventScopeKeyPart(periodKey, eventId)}:${itemId}.${field}`;
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
