"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Browser helpers for the Masterplan pages: one fetch wrapper for /api/masterplan/* and a
// localStorage-backed draft hook (never lose typed text — storage errors are swallowed so a
// private window still works, it just can't restore).

export type ApiResult<T = Record<string, unknown>> = { ok: true; data: T } | { ok: false; error: string; status: number };

export async function mpApi<T = Record<string, unknown>>(path: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api/masterplan/${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const error =
        res.status === 401
          ? "หมดเวลาเข้าสู่ระบบ — เข้าสู่ระบบใหม่ (ข้อความที่พิมพ์ไว้ยังอยู่)"
          : typeof data.error === "string"
            ? data.error
            : `บันทึกไม่สำเร็จ (${res.status})`;
      return { ok: false, error, status: res.status };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "เชื่อมต่อไม่ได้ — ข้อความยังเก็บไว้ในเครื่อง ลองใหม่อีกครั้ง", status: 0 };
  }
}

export function readLocal<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full / blocked — nothing to do
  }
}

export function removeLocal(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * State that mirrors itself into localStorage on every change and restores on mount.
 * `clear()` resets to the initial value and forgets the stored copy (after a successful save).
 */
export function useLocalDraft<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void, () => void, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [restored, setRestored] = useState(false);
  const initialRef = useRef(initial);
  const loaded = useRef(false);

  useEffect(() => {
    const stored = readLocal<T>(key);
    if (stored !== null) {
      setValue(stored);
      setRestored(true);
    }
    loaded.current = true;
  }, [key]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        if (loaded.current) writeLocal(key, resolved);
        return resolved;
      });
    },
    [key]
  );

  const clear = useCallback(() => {
    removeLocal(key);
    setValue(initialRef.current);
    setRestored(false);
  }, [key]);

  return [value, update, clear, restored];
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
