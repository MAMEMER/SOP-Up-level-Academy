"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkRecordDoc, WorkRecordOwner, WorkRecordScope } from "./work-records.ts";

// Client side of the work-record store. Reads the signed-in user's documents for a scope
// window and writes the current window back (debounced), so a checklist survives a page
// refresh, a different phone, and shows up in review / KPI.

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "read-only";

async function readRecords(
  params: URLSearchParams
): Promise<{ records: WorkRecordDoc[]; storageReady: boolean; ownerKey?: string }> {
  const res = await fetch(`/api/work-records?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) return { records: [], storageReady: false };
  return (await res.json()) as { records: WorkRecordDoc[]; storageReady: boolean; ownerKey?: string };
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
  owner: WorkRecordOwner = "me",
  options: { keepalive?: boolean } = {}
): Promise<{ updatedAt?: string }> {
  const body = JSON.stringify({ scope, scopeKey, owner, data });
  const res = await fetch("/api/work-records", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body,
    // keepalive lets a save started on pagehide / navigation finish after the page is gone
    // (browsers cap in-flight keepalive bodies at 64KB, so only small payloads use it)
    keepalive: Boolean(options.keepalive) && new TextEncoder().encode(body).length < 60_000
  });
  if (!res.ok) throw new Error(`save failed: ${res.status}`);
  return ((await res.json().catch(() => ({}))) as { updatedAt?: string }) ?? {};
}

// ── Unsaved-changes backup ────────────────────────────────────────────────────────────
// Ticks that haven't reached the server yet are mirrored to localStorage, keyed by the
// record's owner + scope window, so closing the tab / losing signal / a crash doesn't drop
// them. Each backup remembers the server version (`baseUpdatedAt`) it was built on; it is
// replayed only if the server still holds exactly that version — if anything newer was
// saved (another phone, or this save landed but the reply was lost) the backup is dropped
// and the server copy wins.

type PendingBackup = { data: Record<string, unknown>; baseUpdatedAt: string | null; savedAt: number };

const PENDING_PREFIX = "sop:work-record-pending:v1";

function pendingStorageKey(ownerKey: string, scope: WorkRecordScope, scopeKey: string) {
  return `${PENDING_PREFIX}:${ownerKey}:${scope}:${scopeKey}`;
}

function readPendingBackup(key: string): PendingBackup | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingBackup;
    return parsed && typeof parsed.data === "object" && parsed.data ? parsed : null;
  } catch {
    return null;
  }
}

function writePendingBackup(key: string, backup: PendingBackup) {
  try {
    window.localStorage.setItem(key, JSON.stringify(backup));
  } catch {
    // storage full / disabled — the in-memory retry still runs
  }
}

function clearPendingBackup(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
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
  // localStorage key for this window's unsaved backup (null until the owner is known) and
  // the server version the current data is based on.
  const backupKey = useRef<string | null>(null);
  const serverUpdatedAt = useRef<string | null>(null);
  const flushRef = useRef<(options?: { keepalive?: boolean }) => Promise<boolean>>(async () => true);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    backupKey.current = null;
    fetchWorkRecordRange(scope, fromScopeKey || scopeKey, toScopeKey || scopeKey, { owner })
      .then((result) => {
        if (cancelled) return;
        setHistory(result.records);
        const current = result.records.find((record) => record.scopeKey === scopeKey);
        let loadedData = (current?.data as T) ?? emptyRef.current;
        serverUpdatedAt.current = current?.updatedAt ?? null;

        let replay = false;
        if (!readOnly && result.storageReady && result.ownerKey) {
          const key = pendingStorageKey(result.ownerKey, scope, scopeKey);
          backupKey.current = key;
          const backup = readPendingBackup(key);
          if (backup) {
            if (backup.baseUpdatedAt === serverUpdatedAt.current && !pending.current) {
              // never acknowledged and the server hasn't moved since → re-send it
              loadedData = backup.data as T;
              pending.current = loadedData;
              replay = true;
            } else if (backup.baseUpdatedAt !== serverUpdatedAt.current) {
              // server has a newer version → it wins, the stale backup is dropped
              clearPendingBackup(key);
            }
          }
        }

        dataRef.current = loadedData;
        setData(loadedData);
        setLoaded(true);
        if (replay) void flushRef.current();
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, scopeKey, fromScopeKey, toScopeKey, owner, readOnly]);

  /**
   * บันทึกสิ่งที่ค้างอยู่ทันที คืน true เมื่อถึง server จริง. ลองใหม่อัตโนมัติเมื่อเน็ตสะดุด
   * และไม่ทิ้ง payload จนกว่าจะสำเร็จ — ผู้เรียกจึงเชื่อผลลัพธ์ได้ (ปุ่มส่งงานใช้ค่านี้
   * ตัดสินว่าจะบอกน้องว่า "ส่งแล้ว" หรือ "ยังไม่ถึงระบบ")
   */
  const flush = useCallback(async (options: { keepalive?: boolean } = {}): Promise<boolean> => {
    if (readOnly) return true;
    if (!pending.current) return true;
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const key = backupKey.current;
    setStatus("saving");
    for (let attempt = 0; ; attempt += 1) {
      const payload = pending.current;
      if (!payload) return true;
      try {
        const result = await saveWorkRecord(scope, scopeKey, payload, owner, { keepalive: options.keepalive && attempt === 0 });
        if (result.updatedAt) serverUpdatedAt.current = result.updatedAt;
        // มีการติ๊กใหม่ระหว่างกำลังส่ง → เก็บ payload ใหม่ไว้ให้รอบถัดไป
        if (pending.current === payload) {
          pending.current = null;
          if (key) clearPendingBackup(key);
        } else if (key && pending.current) {
          // the newer ticks are now based on the version we just saved
          writePendingBackup(key, { data: pending.current, baseUpdatedAt: serverUpdatedAt.current, savedAt: Date.now() });
        }
        setStatus("saved");
        return true;
      } catch {
        if (attempt >= SAVE_RETRY_DELAYS_MS.length) {
          // the backup stays in localStorage → replayed on the next load
          setStatus("error");
          return false;
        }
        await wait(SAVE_RETRY_DELAYS_MS[attempt]);
      }
    }
  }, [scope, scopeKey, owner, readOnly]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

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
      if (backupKey.current) {
        writePendingBackup(backupKey.current, { data: next, baseUpdatedAt: serverUpdatedAt.current, savedAt: Date.now() });
      }
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        void flush();
      }, SAVE_DEBOUNCE_MS);
    },
    [flush, readOnly]
  );

  // Don't lose the last few hundred ms of ticks when the tab is closed / backgrounded, or
  // when the staffer navigates to another page before the debounce fires: save right away
  // instead of cancelling (the localStorage backup covers the case where even that fails).
  useEffect(() => {
    if (readOnly) return;
    function flushNow() {
      if (pending.current) void flush({ keepalive: true });
    }
    function onHide() {
      if (document.visibilityState === "hidden") flushNow();
    }
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushNow);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flushNow);
      if (timer.current) {
        window.clearTimeout(timer.current);
        timer.current = null;
        flushNow();
      }
    };
  }, [flush, readOnly]);

  return { data, history, loaded, status, update, flush };
}
