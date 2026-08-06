"use client";

// Firestore store for the owner-edited daily checklist config. One doc per branch in
// sop_daily_checklist holds the per-phase item overrides, submit windows, phase order and
// shift assignment. Read by the checklist page (to render the tailored routine) and the
// owner editor (to edit it).

import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase-client.ts";
import { emptyChecklistConfig, type ChecklistConfig, type ChecklistOverrides } from "./daily-checklist.ts";

const COLLECTION = "sop_daily_checklist";

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
  const snap = await getDoc(doc(db, COLLECTION, branch));
  if (!snap.exists()) return emptyChecklistConfig;
  const data = snap.data() as DailyChecklistDoc;
  return {
    overrides: data.overrides ?? {},
    windows: data.windows ?? {},
    order: data.order ?? [],
    shifts: data.shifts ?? {},
    manual: data.manual ?? {},
    customPhases: data.customPhases ?? [],
    hiddenPhases: data.hiddenPhases ?? [],
    titles: data.titles ?? {},
    evidence: data.evidence ?? {}
  };
}

export async function saveChecklistConfig(input: {
  branch: string;
  config: ChecklistConfig;
  updatedBy: string;
}): Promise<void> {
  const record: DailyChecklistDoc = {
    branch: input.branch,
    overrides: input.config.overrides,
    windows: input.config.windows,
    order: input.config.order,
    shifts: input.config.shifts,
    manual: input.config.manual,
    customPhases: input.config.customPhases,
    hiddenPhases: input.config.hiddenPhases,
    titles: input.config.titles,
    evidence: input.config.evidence,
    updatedAt: new Date().toISOString(),
    updatedBy: input.updatedBy
  };
  await setDoc(doc(db, COLLECTION, input.branch), record);
}
