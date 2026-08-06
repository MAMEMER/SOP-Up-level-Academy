"use client";

// Client store for the owner-edited weekly/monthly checklist overrides. Goes through the
// authenticated /api/checklist-overrides route (Admin SDK, session-verified) — the same shape
// as the daily config store, one document per scope.

import { useEffect, useState } from "react";
import {
  emptyChecklistOverrides,
  type ChecklistOverrides,
  type ChecklistScope
} from "./checklist-overrides.ts";

export async function fetchChecklistOverrides(scope: ChecklistScope): Promise<ChecklistOverrides> {
  const res = await fetch(`/api/checklist-overrides?scope=${encodeURIComponent(scope)}`, { cache: "no-store" });
  if (!res.ok) return emptyChecklistOverrides;
  const { overrides } = (await res.json()) as { overrides: ChecklistOverrides };
  return overrides ?? emptyChecklistOverrides;
}

export async function saveChecklistOverrides(input: {
  scope: ChecklistScope;
  overrides: ChecklistOverrides;
}): Promise<void> {
  const res = await fetch("/api/checklist-overrides", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scope: input.scope, overrides: input.overrides })
  });
  if (!res.ok) throw new Error(`checklist-overrides write failed: ${res.status}`);
}

/**
 * Reads the owner's overrides for a scope once on mount. Staff checklist components use this
 * to render the tailored list; until it loads (or if it fails) the built-in checklist shows.
 */
export function useChecklistOverrides(scope: ChecklistScope): ChecklistOverrides {
  const [overrides, setOverrides] = useState<ChecklistOverrides>(emptyChecklistOverrides);
  useEffect(() => {
    let alive = true;
    fetchChecklistOverrides(scope)
      .then((data) => alive && setOverrides(data))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [scope]);
  return overrides;
}
