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

/** When/who last saved a scope's overrides — powers the editor's "แก้ไขล่าสุด" line. */
export type ChecklistOverridesMeta = { updatedAt: string | null; updatedBy: string | null };

export async function fetchChecklistOverrides(scope: ChecklistScope): Promise<ChecklistOverrides> {
  const res = await fetch(`/api/checklist-overrides?scope=${encodeURIComponent(scope)}`, { cache: "no-store" });
  if (!res.ok) return emptyChecklistOverrides;
  const { overrides } = (await res.json()) as { overrides: ChecklistOverrides };
  return overrides ?? emptyChecklistOverrides;
}

/** Same read, but also returns who/when last saved (for the editor's meta line). */
export async function fetchChecklistOverridesWithMeta(
  scope: ChecklistScope
): Promise<{ overrides: ChecklistOverrides; meta: ChecklistOverridesMeta }> {
  const res = await fetch(`/api/checklist-overrides?scope=${encodeURIComponent(scope)}`, { cache: "no-store" });
  if (!res.ok) return { overrides: emptyChecklistOverrides, meta: { updatedAt: null, updatedBy: null } };
  const data = (await res.json()) as { overrides?: ChecklistOverrides; updatedAt?: string | null; updatedBy?: string | null };
  return {
    overrides: data.overrides ?? emptyChecklistOverrides,
    meta: { updatedAt: data.updatedAt ?? null, updatedBy: data.updatedBy ?? null }
  };
}

export async function saveChecklistOverrides(input: {
  scope: ChecklistScope;
  overrides: ChecklistOverrides;
}): Promise<ChecklistOverridesMeta> {
  const res = await fetch("/api/checklist-overrides", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scope: input.scope, overrides: input.overrides })
  });
  if (!res.ok) throw new Error(`checklist-overrides write failed: ${res.status}`);
  const data = (await res.json().catch(() => ({}))) as { updatedAt?: string | null; updatedBy?: string | null };
  return { updatedAt: data.updatedAt ?? null, updatedBy: data.updatedBy ?? null };
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
