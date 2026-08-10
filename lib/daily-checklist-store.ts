"use client";

// Client store for the owner-edited daily checklist config. Fix 1: sop_daily_checklist
// used to be world read/write via the Firebase client SDK; it now goes through the
// authenticated /api/checklist-config route (Admin SDK, session-verified). The exported
// type and function signatures are unchanged.

import { emptyChecklistConfig, type ChecklistConfig, type ChecklistOverrides } from "./daily-checklist.ts";

export type DailyChecklistDoc = {
  branch: string;
  overrides: ChecklistOverrides;
  windows?: ChecklistConfig["windows"];
  order?: ChecklistConfig["order"];
  shifts?: ChecklistConfig["shifts"];
  manual?: ChecklistConfig["manual"];
  customPhases?: ChecklistConfig["customPhases"];
  hiddenPhases?: ChecklistConfig["hiddenPhases"];
  titles?: ChecklistConfig["titles"];
  evidence?: ChecklistConfig["evidence"];
  guides?: ChecklistConfig["guides"];
  updatedAt: string;
  updatedBy: string;
};

/** When and who last saved the config, so the editor can show a "แก้ไขล่าสุด" line. */
export type ChecklistConfigMeta = { updatedAt: string | null; updatedBy: string | null };

/** Reads the config plus its last-saved metadata. Docs written before the meta/windows/order existed still load. */
export async function fetchChecklistConfigWithMeta(
  branch: string
): Promise<{ config: ChecklistConfig } & ChecklistConfigMeta> {
  const res = await fetch(`/api/checklist-config?branch=${encodeURIComponent(branch)}`, { cache: "no-store" });
  if (!res.ok) return { config: emptyChecklistConfig, updatedAt: null, updatedBy: null };
  const data = (await res.json()) as { config?: ChecklistConfig; updatedAt?: string | null; updatedBy?: string | null };
  return {
    config: data.config ?? emptyChecklistConfig,
    updatedAt: data.updatedAt ?? null,
    updatedBy: data.updatedBy ?? null
  };
}

/** Reads the whole config. Docs written before windows/order/shifts existed still load. */
export async function fetchChecklistConfig(branch: string): Promise<ChecklistConfig> {
  return (await fetchChecklistConfigWithMeta(branch)).config;
}

export async function saveChecklistConfig(input: {
  branch: string;
  config: ChecklistConfig;
  updatedBy: string;
}): Promise<ChecklistConfigMeta> {
  const res = await fetch("/api/checklist-config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ branch: input.branch, config: input.config })
  });
  if (!res.ok) throw new Error(`checklist-config write failed: ${res.status}`);
  const data = (await res.json().catch(() => ({}))) as { updatedAt?: string | null; updatedBy?: string | null };
  return { updatedAt: data.updatedAt ?? null, updatedBy: data.updatedBy ?? null };
}
