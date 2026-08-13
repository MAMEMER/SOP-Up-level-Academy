"use client";

// Client store for the owner-edited weekly/monthly checklist overrides. Goes through the
// authenticated /api/checklist-overrides route (Admin SDK, session-verified) — the same shape
// as the daily config store, one document per scope.

import { useEffect, useState } from "react";
import {
  emptyChecklistScopeConfig,
  normalizeScopeConfig,
  type ChecklistOverrides,
  type ChecklistScope,
  type ChecklistScopeConfig
} from "./checklist-overrides.ts";

/** When/who last saved a scope's overrides — powers the editor's "แก้ไขล่าสุด" line. */
export type ChecklistOverridesMeta = { updatedAt: string | null; updatedBy: string | null };

/** Whole scope document (items + ลำดับ/ปิดหัวข้อ/หัวข้อที่เพิ่มเอง). */
export async function fetchChecklistScopeConfig(scope: ChecklistScope): Promise<ChecklistScopeConfig> {
  const res = await fetch(`/api/checklist-overrides?scope=${encodeURIComponent(scope)}`, { cache: "no-store" });
  if (!res.ok) return emptyChecklistScopeConfig;
  return normalizeScopeConfig((await res.json()) as Partial<ChecklistScopeConfig>);
}

export async function fetchChecklistOverrides(scope: ChecklistScope): Promise<ChecklistOverrides> {
  return (await fetchChecklistScopeConfig(scope)).overrides;
}

/** Same read, but also returns who/when last saved (for the editor's meta line). */
export async function fetchChecklistConfigWithMeta(
  scope: ChecklistScope
): Promise<{ config: ChecklistScopeConfig; meta: ChecklistOverridesMeta }> {
  const res = await fetch(`/api/checklist-overrides?scope=${encodeURIComponent(scope)}`, { cache: "no-store" });
  if (!res.ok) return { config: emptyChecklistScopeConfig, meta: { updatedAt: null, updatedBy: null } };
  const data = (await res.json()) as Partial<ChecklistScopeConfig> & { updatedAt?: string | null; updatedBy?: string | null };
  return {
    config: normalizeScopeConfig(data),
    meta: { updatedAt: data.updatedAt ?? null, updatedBy: data.updatedBy ?? null }
  };
}

export async function saveChecklistOverrides(input: {
  scope: ChecklistScope;
  config: ChecklistScopeConfig;
}): Promise<ChecklistOverridesMeta> {
  const res = await fetch("/api/checklist-overrides", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scope: input.scope, ...input.config })
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
  return useChecklistScopeConfig(scope).overrides;
}

/** Same, but the whole scope config (ลำดับ / หัวข้อที่ปิด / หัวข้อที่เพิ่มเอง ด้วย). */
export function useChecklistScopeConfig(scope: ChecklistScope): ChecklistScopeConfig {
  const [config, setConfig] = useState<ChecklistScopeConfig>(emptyChecklistScopeConfig);
  useEffect(() => {
    let alive = true;
    fetchChecklistScopeConfig(scope)
      .then((data) => alive && setConfig(data))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [scope]);
  return config;
}
