// ที่เก็บ draft/preview state ของ checklist งานกิจกรรมประจำสัปดาห์ (client-side)
// เก็บใน localStorage แยกตาม ISO week → ขึ้นสัปดาห์ใหม่ checklist reset อัตโนมัติ
//
// เป็นข้อมูล "operational" ของวันกิจกรรม (ไม่เกี่ยวกับ KPI / เงินเดือน) จึงบันทึก draft
// ได้เสมอ ไม่ต้องรอเปิดโหมดบันทึกจริง (ปุ่ม "บันทึก" ต้องใช้งานได้จริงตาม requirement)
// ไม่มีการเขียน Firestore / ไม่มีข้อมูลการเงิน → ไม่กระทบ invariant ใด

import { isoWeekKey } from "./periodic-tasks.ts";

const tickStorageKey = "up-level-weekly-event-ticks";
const dataStorageKey = "up-level-weekly-event-data";
const submitStorageKey = "up-level-weekly-event-submitted";

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

function safeParse<T extends Record<string, unknown>>(raw: string | null): T {
  if (!raw) return {} as T;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as T) : ({} as T);
  } catch {
    return {} as T;
  }
}

function readMap<T extends Record<string, unknown>>(key: string): T {
  if (typeof window === "undefined") return {} as T;
  return safeParse<T>(window.localStorage.getItem(key));
}

function writeMap(key: string, value: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function readWeeklyEventTicks(): Record<string, boolean> {
  return readMap<Record<string, boolean>>(tickStorageKey);
}

export function persistWeeklyEventTicks(ticks: Record<string, boolean>) {
  writeMap(tickStorageKey, ticks);
}

export function readWeeklyEventData(): Record<string, string> {
  return readMap<Record<string, string>>(dataStorageKey);
}

export function persistWeeklyEventData(data: Record<string, string>) {
  writeMap(dataStorageKey, data);
}

export function readWeeklyEventSubmitted(): Record<string, boolean> {
  return readMap<Record<string, boolean>>(submitStorageKey);
}

export function persistWeeklyEventSubmitted(submitted: Record<string, boolean>) {
  writeMap(submitStorageKey, submitted);
}
