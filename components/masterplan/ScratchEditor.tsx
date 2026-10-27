"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleCheck, Clock, TriangleAlert } from "lucide-react";
import { readLocal, writeLocal } from "../../lib/masterplan-client.ts";

// กระดาษทด (own). Never loses text: every keystroke goes to localStorage at once, and to
// the server ~1.5 s after typing stops. On load, an unsynced local copy wins over the
// server copy (e.g. the tab was closed while offline) and is pushed up again.

type LocalCopy = { text: string; synced: boolean; at: number };
const DEBOUNCE_MS = 1500;

export function ScratchEditor({ memberKey, serverText, serverUpdatedAt }: { memberKey: string; serverText: string; serverUpdatedAt: string | null }) {
  const key = `mp-scratch-${memberKey}`;
  const [text, setText] = useState(serverText);
  const [state, setState] = useState<"saved" | "pending" | "saving" | "error">("saved");
  const [savedAt, setSavedAt] = useState<string | null>(serverUpdatedAt);
  const [restored, setRestored] = useState(false);
  const timer = useRef<number | null>(null);
  const latest = useRef(text);
  const pending = useRef(false);

  const push = useCallback(
    async (value: string, keepalive = false) => {
      setState("saving");
      try {
        const res = await fetch("/api/masterplan/scratch", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markdown: value }),
          keepalive
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { updatedAt?: string };
        if (latest.current === value) {
          pending.current = false;
          writeLocal(key, { text: value, synced: true, at: Date.now() } satisfies LocalCopy);
          setState("saved");
        } else {
          setState("pending");
        }
        setSavedAt(data.updatedAt ?? new Date().toISOString());
      } catch {
        setState("error");
      }
    },
    [key]
  );

  const schedule = useCallback(
    (value: string) => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void push(value), DEBOUNCE_MS);
    },
    [push]
  );

  useEffect(() => {
    const local = readLocal<LocalCopy>(key);
    if (local && !local.synced && local.text !== serverText) {
      setText(local.text);
      latest.current = local.text;
      pending.current = true;
      setRestored(true);
      setState("pending");
      schedule(local.text);
    } else {
      writeLocal(key, { text: serverText, synced: true, at: Date.now() } satisfies LocalCopy);
    }
    const flush = () => {
      if (pending.current) void push(latest.current, true);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      if (timer.current) window.clearTimeout(timer.current);
    };
    // run once per member (serverText is the value at load time on purpose)
  }, [key]);

  function onChange(value: string) {
    setText(value);
    latest.current = value;
    pending.current = true;
    writeLocal(key, { text: value, synced: false, at: Date.now() } satisfies LocalCopy);
    setState("pending");
    schedule(value);
  }

  const time = savedAt ? new Date(savedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }) : null;

  return (
    <div className="mp-scratch">
      <div className="mp-scratch__status" role="status" aria-live="polite">
        {state === "saved" ? (
          <>
            <CircleCheck size={15} aria-hidden="true" /> บันทึกแล้ว{time ? ` ${time}` : ""}
          </>
        ) : state === "error" ? (
          <span className="mp-scratch__err">
            <TriangleAlert size={15} aria-hidden="true" /> ยังส่งขึ้นเซิร์ฟเวอร์ไม่ได้ — เก็บไว้ในเครื่องแล้ว{" "}
            <button type="button" className="mp-linkbtn" onClick={() => void push(latest.current)}>
              ลองอีกครั้ง
            </button>
          </span>
        ) : (
          <>
            <Clock size={15} aria-hidden="true" /> {state === "saving" ? "กำลังบันทึก…" : "เก็บในเครื่องแล้ว รอบันทึก…"}
          </>
        )}
        {restored ? <span className="mp-meta"> · กู้ข้อความที่ยังไม่ได้บันทึกกลับมาแล้ว</span> : null}
      </div>
      <textarea
        className="mp-textarea mp-textarea--scratch"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="จดความคิด ร่างข้อเสนอ โน้ตจากการคุยกับ AI — ที่นี่ไม่กระทบฉบับกลาง"
        aria-label="กระดาษทดของฉัน"
        spellCheck={false}
      />
    </div>
  );
}
