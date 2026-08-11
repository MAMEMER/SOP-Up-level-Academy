"use client";

// Client store for Weekly / Monthly Stock Runs. Talks to the authenticated /api/stock-runs
// route (Admin SDK, session-verified) — never the Firebase browser SDK — so writes are
// ownership-checked and blocked while impersonating. Mirrors lib/work-assignments-store.ts.

import type { StockCountLine, StockRun, StockRunKind } from "./stock-runs.ts";

async function getJson<T>(params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/stock-runs?${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`stock-runs read failed: ${res.status}`);
  return (await res.json()) as T;
}

async function post(body: Record<string, unknown>): Promise<void> {
  const res = await fetch("/api/stock-runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const detail = await res
      .json()
      .then((d) => (d as { detail?: string; error?: string }).detail || (d as { error?: string }).error)
      .catch(() => undefined);
    throw new Error(detail || `stock-runs write failed: ${res.status}`);
  }
}

export async function fetchRunsForStaff(branch: string, staffCode: string, kind?: StockRunKind): Promise<StockRun[]> {
  const { runs } = await getJson<{ runs: StockRun[] }>({
    action: "runsForStaff",
    branch,
    staffCode,
    ...(kind ? { kind } : {})
  });
  return runs;
}

export async function fetchRunsForBranch(branch: string, kind?: StockRunKind): Promise<StockRun[]> {
  const { runs } = await getJson<{ runs: StockRun[] }>({ action: "runsForBranch", branch, ...(kind ? { kind } : {}) });
  return runs;
}

export async function fetchRunById(id: string): Promise<StockRun | null> {
  const { run } = await getJson<{ run: StockRun | null }>({ action: "runById", id });
  return run;
}

export async function assignRun(input: {
  kind: StockRunKind;
  branch: string;
  staffCode: string;
  periodLabel: string;
  dueDate?: string;
}): Promise<void> {
  await post({ action: "assignRun", ...input });
}

export async function startRun(id: string): Promise<void> {
  await post({ action: "startRun", id });
}

export async function startNewRun(input: {
  kind: StockRunKind;
  branch: string;
  periodLabel: string;
  dueDate?: string;
}): Promise<void> {
  await post({ action: "startNewRun", ...input });
}

export type StockRunDraft = {
  counts: StockCountLine[];
  checklistDone: Record<string, boolean>;
  lowStock: string;
  refill: string;
  reorder: string;
  note: string;
  evidence: string[];
};

export async function saveRun(id: string, draft: StockRunDraft): Promise<void> {
  await post({ action: "saveRun", id, ...draft });
}

export async function submitRun(id: string, draft: StockRunDraft): Promise<void> {
  await post({ action: "submitRun", id, ...draft });
}

export async function approveRun(id: string, note = ""): Promise<void> {
  await post({ action: "approveRun", id, note });
}

export async function requestRunRevision(id: string, note: string): Promise<void> {
  await post({ action: "requestRevision", id, note });
}

export async function deleteRun(id: string): Promise<void> {
  await post({ action: "deleteRun", id });
}
