"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkRecordDoc, WorkRecordOwner, WorkRecordScope } from "./work-records.ts";

// Client side of the work-record store. Reads the signed-in user's documents for a scope
// window and writes the current window back (debounced), so a checklist survives a page
// refresh, a different phone, and shows up in review / KPI.

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "read-only";

async function readRecords(params: URLSearchParams): Promise<{ records: WorkRecordDoc[]; storageReady: boolean }> {
  const res = await fetch(`/api/work-records?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) return { records: [], storageReady: false };
  return (await res.json()) as { records: WorkRecordDoc[]; storageReady: boolean };
}

export async function fetchWorkRecordRange(
  scope: WorkRecordScope,
  from: string,
  to: string,
  options: { employee?: string; owner?: WorkRecordOwner } = {}
) {
  const params = new URLSearchParams({ scope, from, to });
  if (options.employee) params.set("employee", options.employee);
  if (options.owner) params.set("owner", options.owner);
  return readRecords(params);
}

/** Admin-only: every employee's document for one exact window (e.g. today). */
export async function fetchWorkRecordsForEveryone(scope: WorkRecordScope, scopeKey: string) {
  return readRecords(new URLSearchParams({ scope, scopeKey, everyone: "1" }));
}

export async function saveWorkRecord(
  scope: WorkRecordScope,
  scopeKey: string,
  data: Record<string, unknown>,
  owner: WorkRecordOwner = "me"
) {
  const res = await fetch("/api/work-records", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope, scopeKey, owner, data })
  });
  if (!res.ok) throw new Error(`save failed: ${res.status}`);
}

const SAVE_DEBOUNCE_MS = 700;

/**
 * Loads one scope window (plus optional history range for streaks / previous-day lookups)
 * and keeps the current window synced to the server.
 */
export function useWorkRecordWindow<T extends Record<string, unknown>>(options: {
  scope: WorkRecordScope;
  scopeKey: string;
  /** Inclusive history bounds; defaults to just the current window. */
  fromScopeKey?: string;
  toScopeKey?: string;
  /** Impersonated / preview views never write. */
  readOnly?: boolean;
  /** "team" = one shared branch record (weekly / monthly stock counts). */
  owner?: WorkRecordOwner;
  empty: T;
}) {
  const { scope, scopeKey, fromScopeKey, toScopeKey, readOnly = false, owner = "me" } = options;
  const emptyRef = useRef(options.empty);

  const [data, setData] = useState<T>(emptyRef.current);
  const [history, setHistory] = useState<WorkRecordDoc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<SaveStatus>(readOnly ? "read-only" : "idle");

  const pending = useRef<T | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    fetchWorkRecordRange(scope, fromScopeKey || scopeKey, toScopeKey || scopeKey, { owner })
      .then((result) => {
        if (cancelled) return;
        setHistory(result.records);
        const current = result.records.find((record) => record.scopeKey === scopeKey);
        setData((current?.data as T) ?? emptyRef.current);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, scopeKey, fromScopeKey, toScopeKey, owner]);

  const flush = useCallback(async () => {
    const payload = pending.current;
    if (!payload) return;
    pending.current = null;
    setStatus("saving");
    try {
      await saveWorkRecord(scope, scopeKey, payload, owner);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }, [scope, scopeKey, owner]);

  const update = useCallback(
    (updater: (previous: T) => T) => {
      setData((previous) => {
        const next = updater(previous);
        if (readOnly) return next;
        pending.current = next;
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          void flush();
        }, SAVE_DEBOUNCE_MS);
        return next;
      });
    },
    [flush, readOnly]
  );

  // Don't lose the last few hundred ms of ticks when the tab is closed / backgrounded.
  useEffect(() => {
    if (readOnly) return;
    function onHide() {
      if (document.visibilityState === "hidden" && pending.current) void flush();
    }
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [flush, readOnly]);

  return { data, history, loaded, status, update, flush };
}
