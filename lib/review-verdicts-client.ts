"use client";

import type { ReviewScope, ReviewStatus, ReviewVerdict } from "./review-verdicts.ts";

// Client side of the admin review verdicts. Talks only to the authenticated
// /api/review-verdicts route (Admin SDK, session-verified) — never the browser Firestore
// SDK. Mirrors lib/stock-runs-store.ts.

export async function fetchVerdicts(scope: ReviewScope, scopeKey: string): Promise<ReviewVerdict[]> {
  const params = new URLSearchParams({ scope, scopeKey });
  const res = await fetch(`/api/review-verdicts?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) return [];
  const body = (await res.json().catch(() => null)) as { verdicts?: ReviewVerdict[] } | null;
  return body?.verdicts ?? [];
}

export async function saveVerdict(input: {
  scope: ReviewScope;
  scopeKey: string;
  employeeKey: string;
  employeeName: string;
  unitId: string;
  unitLabel: string;
  status: ReviewStatus;
  note: string;
}): Promise<ReviewVerdict> {
  const res = await fetch("/api/review-verdicts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!res.ok) {
    const detail = await res
      .json()
      .then((d) => (d as { detail?: string; error?: string }).detail || (d as { error?: string }).error)
      .catch(() => undefined);
    throw new Error(detail || `verdict write failed: ${res.status}`);
  }
  const body = (await res.json()) as { verdict: ReviewVerdict };
  return body.verdict;
}
