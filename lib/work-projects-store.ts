"use client";

// Client store for งานแบบโปรเจกต์ — ทุกอย่างผ่าน /api/work-projects (Admin SDK,
// session-verified) เหมือน work-assignments-store. ไม่มีการเขียน Firestore ตรงจาก browser.

import type { WorkProject } from "./work-projects.ts";

async function getJson<T>(params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/work-projects?${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`work-projects read failed: ${res.status}`);
  return (await res.json()) as T;
}

async function post(body: Record<string, unknown>): Promise<void> {
  const res = await fetch("/api/work-projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const detail = await res
      .json()
      .then((d) => (d as { detail?: string }).detail)
      .catch(() => undefined);
    // ข้อความที่คนอ่านรู้เรื่อง — ฝั่ง route ส่ง detail ภาษาไทยมาให้อยู่แล้วเมื่อกรอกไม่ครบ
    if (detail) throw new Error(detail);
    if (res.status === 403) throw new Error("บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้");
    if (res.status === 503) throw new Error("ระบบบันทึกยังไม่พร้อม ลองใหม่อีกครั้ง");
    throw new Error("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
}

export async function fetchProjectsForBranch(branch: string): Promise<WorkProject[]> {
  const { projects } = await getJson<{ projects: WorkProject[] }>({ action: "projectsForBranch", branch });
  return projects;
}

export async function fetchProjectsForStaff(branch: string, staffCode: string): Promise<WorkProject[]> {
  const { projects } = await getJson<{ projects: WorkProject[] }>({ action: "projectsForStaff", branch, staffCode });
  return projects;
}

export async function fetchProjectById(id: string): Promise<WorkProject | null> {
  const { project } = await getJson<{ project: WorkProject | null }>({ action: "projectById", id });
  return project;
}

export async function createProject(input: {
  branch: string;
  title: string;
  detail?: string;
  expectedResult?: string;
  startDate: string;
  endDate: string;
  assignees: string[];
  /** เดี่ยว = คนเดียวส่งเอง · กลุ่ม = ใครในทีมส่งก็นับ */
  mode?: "single" | "group";
  openTime?: string;
  dueTime?: string;
  answer?: { kind: string; options?: string[]; placeholder?: string };
}): Promise<void> {
  await post({ action: "createProject", ...input });
}

export async function updateProjectDates(id: string, startDate: string, endDate: string): Promise<void> {
  await post({ action: "updateProjectDates", id, startDate, endDate });
}

export async function updateProjectAssignees(id: string, assignees: string[]): Promise<void> {
  await post({ action: "updateProjectAssignees", id, assignees });
}

export async function updateProjectDetail(input: {
  id: string;
  title: string;
  detail?: string;
  expectedResult?: string;
}): Promise<void> {
  await post({ action: "updateProjectDetail", ...input });
}

export async function setProjectMode(id: string, mode: "single" | "group"): Promise<void> {
  await post({ action: "setProjectMode", id, mode });
}

export async function setProjectStatus(id: string, status: "active" | "done" | "cancelled"): Promise<void> {
  await post({ action: "setProjectStatus", id, status });
}

export async function deleteProject(id: string): Promise<void> {
  await post({ action: "deleteProject", id });
}

export async function addProjectProgress(input: {
  id: string;
  date: string;
  percent: number;
  note: string;
  images?: string[];
  link?: string;
}): Promise<void> {
  await post({ action: "addProgress", ...input });
}

export async function deleteProjectProgress(id: string, progressId: string): Promise<void> {
  await post({ action: "deleteProgress", id, progressId });
}

/** แอดมินปรับแถบ % ของงานโดยตรง (เพิ่ม/ลด) — server ตรวจสิทธิ์ว่าเป็นแอดมินจาก session */
export async function setProjectPercent(id: string, percent: number): Promise<void> {
  await post({ action: "setPercent", id, percent });
}
