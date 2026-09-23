"use client";

// Client store for the shared weekly/monthly checklist. Fix 1: sop_shared_tasks used to be
// world read/write via the Firebase client SDK; it now goes through the authenticated
// /api/shared-tasks route (Admin SDK, session-verified). The "by" stamp is set from the
// session server-side. Exported types and signatures are unchanged.

/**
 * หนึ่งรายการที่ทีมติ๊กแล้ว. `value` / `photos` คือคำตอบที่เจ้าของสั่งให้กรอกตอนติ๊ก
 * ("ส่งงานแบบไหน" — พิมพ์ข้อความ / ตัวเลข / ลิงก์ / เลือกตัวเลือก / แนบรูป). รายการที่ติ๊กเฉยๆ
 * ไม่มีสองฟิลด์นี้ เหมือนที่บันทึกไว้ก่อนหน้า.
 */
import type { TaskProgressAction, TaskProgressEntry } from "./task-progress.ts";

export type SharedTick = { by: string; at: string; value?: string; photos?: string[] };
export type SharedTaskDoc = {
  branch: string;
  period: "weekly" | "monthly";
  periodKey: string;
  ticks: Record<string, SharedTick>;
  updatedAt: string;
};

export type SharedTasksPayload = {
  ticks: Record<string, SharedTick>;
  /** ความคืบหน้าของงานที่ยังทำไม่เสร็จในรอบนี้ (คีย์ = taskId) */
  progress: Record<string, TaskProgressEntry>;
};

export async function fetchSharedTicks(
  branch: string,
  period: "weekly" | "monthly",
  periodKey: string
): Promise<SharedTasksPayload> {
  const qs = new URLSearchParams({ branch, period, periodKey }).toString();
  const res = await fetch(`/api/shared-tasks?${qs}`, { cache: "no-store" });
  if (!res.ok) return { ticks: {}, progress: {} };
  const data = (await res.json()) as Partial<SharedTasksPayload>;
  return { ticks: data.ticks ?? {}, progress: data.progress ?? {} };
}

/** ลงความคืบหน้าของงานประจำสัปดาห์/เดือนหนึ่งชิ้น — งานของทีม ใครกดต่อก็ได้ */
export async function updateSharedProgress(input: {
  branch: string;
  period: "weekly" | "monthly";
  periodKey: string;
  taskId: string;
  action: TaskProgressAction;
  percent?: number;
  note?: string;
  value?: string;
  photos?: string[];
}): Promise<SharedTasksPayload> {
  const res = await fetch("/api/shared-tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      branch: input.branch,
      period: input.period,
      periodKey: input.periodKey,
      taskId: input.taskId,
      progress: input.action,
      ...(input.percent === undefined ? {} : { percent: input.percent }),
      ...(input.note ? { note: input.note } : {}),
      ...(input.value ? { value: input.value } : {}),
      ...(input.photos?.length ? { photos: input.photos } : {})
    })
  });
  if (!res.ok) throw new Error(`shared-tasks progress failed: ${res.status}`);
  const data = (await res.json()) as Partial<SharedTasksPayload>;
  return { ticks: data.ticks ?? {}, progress: data.progress ?? {} };
}

/**
 * Toggles a task's tick (แบบเดิม: ติ๊ก/ยกเลิกติ๊กอย่างเดียว). หน้าจอพนักงานใช้
 * `updateSharedProgress` แทนแล้ว — เก็บไว้สำหรับการติ๊กที่ไม่ต้องลงความคืบหน้า.
 */
export async function setSharedTick(input: {
  branch: string;
  period: "weekly" | "monthly";
  periodKey: string;
  taskId: string;
  ticked: boolean;
  by: string;
  atIso: string;
  currentTicks: Record<string, SharedTick>;
  /** คำตอบที่เจ้าของสั่งให้กรอกตอนติ๊ก (ข้อความ / ตัวเลข / ลิงก์ / ตัวเลือกที่เลือก) */
  value?: string;
  /** รูปที่แนบตอนติ๊ก (อัปโหลดผ่าน /api/evidence-upload มาแล้ว) */
  photos?: string[];
}): Promise<Record<string, SharedTick>> {
  const res = await fetch("/api/shared-tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      branch: input.branch,
      period: input.period,
      periodKey: input.periodKey,
      taskId: input.taskId,
      ticked: input.ticked,
      ...(input.value ? { value: input.value } : {}),
      ...(input.photos?.length ? { photos: input.photos } : {})
    })
  });
  if (!res.ok) throw new Error(`shared-tasks write failed: ${res.status}`);
  const { ticks } = (await res.json()) as { ticks: Record<string, SharedTick> };
  return ticks ?? {};
}
