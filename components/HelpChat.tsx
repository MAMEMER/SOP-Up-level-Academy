"use client";

// Floating help chatbot — "อะไรคืออะไร / กดตรงไหน". Calls /api/help-chat (Claude when
// a key is set, else a built-in site guide). Plain CSS, Guild tokens.

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const GREETING: Msg = {
  role: "assistant",
  content: "สวัสดี! ถามได้เลยว่าอะไรคืออะไร กดตรงไหน เช่น “ติ๊ก checklist ยังไง”, “ดูคะแนนพนักงานตรงไหน”, “แจ้งบัคยังไง”"
};

export function HelpChat() {
  const [open, setOpen] = useState(false);
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
      <button className="fab fab-chat" aria-label="ถามผู้ช่วย" title="ถามผู้ช่วย" onClick={() => setOpen((v) => !v)}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
          <path d="M8 12h.01M12 12h.01M16 12h.01" />
        </svg>
      </button>

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
