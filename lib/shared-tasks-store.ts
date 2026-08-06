"use client";

// Client store for the shared weekly/monthly checklist. Fix 1: sop_shared_tasks used to be
// world read/write via the Firebase client SDK; it now goes through the authenticated
// /api/shared-tasks route (Admin SDK, session-verified). The "by" stamp is set from the
// session server-side. Exported types and signatures are unchanged.

export type SharedTick = { by: string; at: string };
export type SharedTaskDoc = {
  branch: string;
  period: "weekly" | "monthly";
  periodKey: string;
  ticks: Record<string, SharedTick>;
  updatedAt: string;
};

export async function fetchSharedTicks(
  branch: string,
  period: "weekly" | "monthly",
  periodKey: string
): Promise<Record<string, SharedTick>> {
  const qs = new URLSearchParams({ branch, period, periodKey }).toString();
  const res = await fetch(`/api/shared-tasks?${qs}`, { cache: "no-store" });
  if (!res.ok) return {};
  const { ticks } = (await res.json()) as { ticks: Record<string, SharedTick> };
  return ticks ?? {};
}

/** Toggles a task's tick. The server applies the toggle and returns the fresh map. */
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
  const res = await fetch("/api/shared-tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      branch: input.branch,
      period: input.period,
      periodKey: input.periodKey,
      taskId: input.taskId,
      ticked: input.ticked
    })
  });
  if (!res.ok) throw new Error(`shared-tasks write failed: ${res.status}`);
  const { ticks } = (await res.json()) as { ticks: Record<string, SharedTick> };
  return ticks ?? {};
}
