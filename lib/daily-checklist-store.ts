"use client";

// Firestore store for owner-edited daily checklist overrides. One doc per branch in
// sop_daily_checklist holds phaseId → item-list overrides. Read by the checklist page
// (to render the tailored list) and the owner editor (to edit it).

import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase-client.ts";
import type { ChecklistOverrides } from "./daily-checklist.ts";

const COLLECTION = "sop_daily_checklist";

export type DailyChecklistDoc = {
  branch: string;
  overrides: ChecklistOverrides;
  updatedAt: string;
  updatedBy: string;
};

export async function fetchChecklistOverrides(branch: string): Promise<ChecklistOverrides> {
  const snap = await getDoc(doc(db, COLLECTION, branch));
  return snap.exists() ? ((snap.data() as DailyChecklistDoc).overrides ?? {}) : {};
}

export async function saveChecklistOverrides(input: {
  branch: string;
  overrides: ChecklistOverrides;
  updatedBy: string;
}): Promise<void> {
  const record: DailyChecklistDoc = {
    branch: input.branch,
    overrides: input.overrides,
    updatedAt: new Date().toISOString(),
    updatedBy: input.updatedBy
  };
  await setDoc(doc(db, COLLECTION, input.branch), record);
}
