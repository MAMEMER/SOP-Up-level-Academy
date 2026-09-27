"use client";

// Floating help chatbot — "อะไรคืออะไร / กดตรงไหน". Calls /api/help-chat (Claude when
// a key is set, else a built-in site guide). Plain CSS, Guild tokens.

import { useEffect, useRef, useState } from "react";
import { OPEN_CHAT_EVENT } from "./SupportFab.tsx";

type Msg = { role: "user" | "assistant"; content: string };

const GREETING: Msg = {
  role: "assistant",
  content: "สวัสดี! ถามได้เลยว่าอะไรคืออะไร กดตรงไหน เช่น “ติ๊ก checklist ยังไง”, “ดูคะแนนพนักงานตรงไหน”, “แจ้งบัคยังไง”"
};

export function HelpChat() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_CHAT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, onOpen);
  }, []);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/help-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next })
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "assistant", content: data.reply || "ลองใหม่อีกครั้ง" }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "ต่อไม่ติด ลองใหม่อีกครั้ง" }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open && (
        <div className="chat-panel">
          <div className="chat-head">
            <strong>ผู้ช่วย SOP</strong>
            <span>ถามได้ว่าอะไรอยู่ตรงไหน</span>
            <button className="fab-x" aria-label="ปิด" onClick={() => setOpen(false)}>✕</button>
          </div>
          <div className="chat-body" ref={bodyRef}>
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>{m.content}</div>
            ))}
            {busy && <div className="chat-msg assistant chat-typing">…</div>}
          </div>
          <div className="chat-input">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              placeholder="พิมพ์คำถาม…"
              aria-label="พิมพ์คำถาม"
            />
            <button className="btn-cute" onClick={send} disabled={busy || !input.trim()}>ส่ง</button>
          </div>
        </div>
      )}
    </>
  );
}
