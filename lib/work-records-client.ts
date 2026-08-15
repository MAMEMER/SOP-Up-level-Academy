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
 * ร้านใช้ Wi-Fi/มือถือ เน็ตสะดุดชั่ววินาทีเกิดขึ้นจริง. เดิมยิงครั้งเดียว พลาดแล้วจบ —
 * งานที่กดไปแล้วหายถาวรทั้งที่หน้าจอยังขึ้นว่าติ๊กครบ กลายเป็น "กดมาแล้วแต่ไม่ขึ้น".
 * ลองใหม่ให้ครบก่อนค่อยยอมแพ้.
 */
const SAVE_RETRY_DELAYS_MS = [600, 1500, 3000];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  // Mirror of the committed data so update() can compute the next payload and stage it for
  // saving SYNCHRONOUSLY. React runs setData's functional updater on the *next* render, so
  // staging pending.current inside it left an immediate flush() (the ปุ่มส่งงาน path) saving
  // the previous/empty payload instead of the just-submitted one — the submit reached the
  // server only via the 700ms debounce, and a refresh before it fired reverted "ส่งแล้ว".
  const dataRef = useRef<T>(emptyRef.current);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    fetchWorkRecordRange(scope, fromScopeKey || scopeKey, toScopeKey || scopeKey, { owner })
      .then((result) => {
        if (cancelled) return;
        setHistory(result.records);
        const current = result.records.find((record) => record.scopeKey === scopeKey);
        const loadedData = (current?.data as T) ?? emptyRef.current;
        dataRef.current = loadedData;
        setData(loadedData);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, scopeKey, fromScopeKey, toScopeKey, owner]);

  /**
   * บันทึกสิ่งที่ค้างอยู่ทันที คืน true เมื่อถึง server จริง. ลองใหม่อัตโนมัติเมื่อเน็ตสะดุด
   * และไม่ทิ้ง payload จนกว่าจะสำเร็จ — ผู้เรียกจึงเชื่อผลลัพธ์ได้ (ปุ่มส่งงานใช้ค่านี้
   * ตัดสินว่าจะบอกน้องว่า "ส่งแล้ว" หรือ "ยังไม่ถึงระบบ")
   */
  const flush = useCallback(async (): Promise<boolean> => {
    if (readOnly) return true;
    if (!pending.current) return true;
    setStatus("saving");
    for (let attempt = 0; ; attempt += 1) {
      const payload = pending.current;
      if (!payload) return true;
      try {
        await saveWorkRecord(scope, scopeKey, payload, owner);
        // มีการติ๊กใหม่ระหว่างกำลังส่ง → เก็บ payload ใหม่ไว้ให้รอบถัดไป
        if (pending.current === payload) pending.current = null;
        setStatus("saved");
        return true;
      } catch {
        if (attempt >= SAVE_RETRY_DELAYS_MS.length) {
          setStatus("error");
          return false;
        }
        await wait(SAVE_RETRY_DELAYS_MS[attempt]);
      }
    }
  }, [scope, scopeKey, owner, readOnly]);

  const update = useCallback(
    (updater: (previous: T) => T) => {
      // Compute from the ref, not from setData's deferred updater, so pending.current is
      // staged in the SAME tick — an immediate flush() (ปุ่มส่งงาน) then saves this exact
      // payload instead of the previous one. dataRef stays the source of truth for the next
      // synchronous update() as well, so back-to-back updates chain correctly.
      const next = updater(dataRef.current);
      dataRef.current = next;
      setData(next);
      if (readOnly) return;
      pending.current = next;
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        void flush();
      }, SAVE_DEBOUNCE_MS);
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
