"use client";

// Client store สำหรับ "งานสั่ง" ของร้าน — ผ่าน /api/store-tasks (Admin SDK + session)
// เหมือน store อื่นในระบบ ไม่มีการเขียน Firestore ตรงจาก browser.

import type { WorkSpec } from "./work-spec.ts";

export type TaskRecord = { by: string; at: string; value?: string; photos?: string[] };

export type StoreTasksPayload = {
  tasks: WorkSpec[];
  records: Record<string, TaskRecord>;
  updatedAt: string | null;
  updatedBy: string | null;
};

export async function fetchStoreTasks(branch: string, date?: string): Promise<StoreTasksPayload> {
  const qs = new URLSearchParams({ branch, ...(date ? { date } : {}) }).toString();
  const res = await fetch(`/api/store-tasks?${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`store-tasks read failed: ${res.status}`);
  const data = (await res.json()) as Partial<StoreTasksPayload>;
  return {
    tasks: data.tasks ?? [],
    records: data.records ?? {},
    updatedAt: data.updatedAt ?? null,
    updatedBy: data.updatedBy ?? null
  };
}

async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch("/api/store-tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const detail = await res
      .json()
      .then((d) => (d as { detail?: string }).detail)
      .catch(() => undefined);
    if (detail) throw new Error(detail);
    if (res.status === 403) throw new Error("บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้");
    if (res.status === 503) throw new Error("ระบบบันทึกยังไม่พร้อม ลองใหม่อีกครั้ง");
    throw new Error("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export async function saveStoreTasks(branch: string, tasks: WorkSpec[]): Promise<{ updatedAt: string | null; updatedBy: string | null }> {
  const data = await post({ action: "saveTasks", branch, tasks });
  return { updatedAt: (data.updatedAt as string) ?? null, updatedBy: (data.updatedBy as string) ?? null };
}

/** ย้ายรายการ checklist สัปดาห์/เดือน ของเดิมเข้ามา — กดซ้ำได้ ของที่แก้ไปแล้วไม่ถูกทับ */
export async function importLegacyTasks(branch: string): Promise<{ tasks: WorkSpec[]; added: number }> {
  const data = await post({ action: "importLegacy", branch });
  return { tasks: (data.tasks as WorkSpec[]) ?? [], added: (data.added as number) ?? 0 };
}

export async function submitStoreTask(input: {
  branch: string;
  date: string;
  taskId: string;
  done: boolean;
  value?: string;
  photos?: string[];
}): Promise<Record<string, TaskRecord>> {
  const data = await post({ action: "submitTask", ...input });
  return (data.done as Record<string, TaskRecord>) ?? {};
}
