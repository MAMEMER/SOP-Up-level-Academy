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
  updatedAt: string;
  updatedBy: string;
};

/** Reads the whole config. Docs written before windows/order/shifts existed still load. */
export async function fetchChecklistConfig(branch: string): Promise<ChecklistConfig> {
  const res = await fetch(`/api/checklist-config?branch=${encodeURIComponent(branch)}`, { cache: "no-store" });
  if (!res.ok) return emptyChecklistConfig;
  const { config } = (await res.json()) as { config: ChecklistConfig };
  return config ?? emptyChecklistConfig;
}

export async function saveChecklistConfig(input: {
  branch: string;
  config: ChecklistConfig;
  updatedBy: string;
}): Promise<void> {
  const res = await fetch("/api/checklist-config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ branch: input.branch, config: input.config })
  });
  if (!res.ok) throw new Error(`checklist-config write failed: ${res.status}`);
}
