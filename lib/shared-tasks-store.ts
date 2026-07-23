"use client";

// Firestore store for the shared weekly/monthly checklist. One doc per
// (branch, period, periodKey) holds a map of taskId → who ticked it and when, so the
// whole team sees the same state and can finish the list together across shifts.
// Stored in sop_daily_checklist? No — separate `sop_shared_tasks` collection.

import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase-client.ts";

const SHARED = "sop_shared_tasks";

export type SharedTick = { by: string; at: string };
export type SharedTaskDoc = {
  branch: string;
  period: "weekly" | "monthly";
  periodKey: string;
  ticks: Record<string, SharedTick>;
  updatedAt: string;
};

function docId(branch: string, period: string, periodKey: string): string {
  return `${branch}__${period}__${periodKey}`;
}

export async function fetchSharedTicks(
  branch: string,
  period: "weekly" | "monthly",
  periodKey: string
): Promise<Record<string, SharedTick>> {
  const snap = await getDoc(doc(db, SHARED, docId(branch, period, periodKey)));
  return snap.exists() ? ((snap.data() as SharedTaskDoc).ticks ?? {}) : {};
}

/** Toggles a task's tick. Pass the full current tick map so the merge stays simple. */
export async function setSharedTick(input: {
  branch: string;
  period: "weekly" | "monthly";
  periodKey: string;
  taskId: string;
  ticked: boolean;
  by: string;
  atIso: string;
  currentTicks: Record<string, SharedTick>;
}): Promise<Record<string, SharedTick>> {
  const nextTicks = { ...input.currentTicks };
  if (input.ticked) nextTicks[input.taskId] = { by: input.by, at: input.atIso };
  else delete nextTicks[input.taskId];

  const record: SharedTaskDoc = {
    branch: input.branch,
    period: input.period,
    periodKey: input.periodKey,
    ticks: nextTicks,
    updatedAt: input.atIso
  };
  await setDoc(doc(db, SHARED, docId(input.branch, input.period, input.periodKey)), record);
  return nextTicks;
}
