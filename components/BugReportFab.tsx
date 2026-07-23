"use client";

// Floating "แจ้งบัค / แนะนำ" button + modal — same idea + triage queue as the guild
// app (writes to Firestore `tickets`, source:'sop'). Plain CSS (this app has no
// Tailwind); styled with the Guild design tokens. No login required.

import { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase-client.ts";

type TicketType = "bug" | "suggestion";
type Status = "idle" | "submitting" | "sent";

export function BugReportFab() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TicketType>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  function reset() {
    setType("bug"); setTitle(""); setDescription(""); setStatus("idle"); setError("");
  }
  function close() { setOpen(false); setTimeout(reset, 250); }

  async function send() {
    setError("");
    if (!title.trim()) { setError("ใส่หัวข้อด้วย"); return; }
    setStatus("submitting");
    try {
      await addDoc(collection(db, "tickets"), {
        type,
        title: title.trim().slice(0, 200),
        description: description.trim().slice(0, 4000),
        url: typeof window !== "undefined" ? window.location.href : "",
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        status: "open",
        notified: false,
        source: "sop",
        userId: null,
        email: "",
        displayName: "",
        createdAt: serverTimestamp(),
        createdAtMs: Date.now()
      });
      setStatus("sent");
      setTimeout(close, 1500);
    } catch (e) {
      setError("ส่งไม่สำเร็จ: " + ((e as Error)?.message || "ลองใหม่อีกครั้ง"));
      setStatus("idle");
    }
  }

  const busy = status === "submitting";

  return (
    <>
      <button className="fab fab-bug" aria-label="แจ้งบัค / แนะนำ" title="แจ้งบัค / แนะนำ" onClick={() => setOpen(true)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
          <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2.1 1.7-3.9 3.8-4M20.97 5c0 2.1-1.6 3.8-3.5 4M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4" />
        </svg>
      </button>

      {open && (
        <div className="fab-overlay" onClick={close}>
          <div className="fab-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fab-modal-head">
              <strong>แจ้งบัค / แนะนำ</strong>
              <button className="fab-x" aria-label="ปิด" onClick={close}>✕</button>
            </div>
            <p className="fab-sub">เว็บเพิ่งเปิด เจอปัญหาหรืออยากแนะนำ แจ้งได้เลย — ทีมงานเห็นทันที</p>

            {status === "sent" ? (
              <div className="fab-sent">✅ ส่งแล้ว ขอบคุณ! ทีมงานจะรีบดูให้</div>
            ) : (
              <div className="fab-body">
                <div className="fab-typerow">
                  <button type="button" className={`fab-type ${type === "bug" ? "on" : ""}`} onClick={() => setType("bug")}>🐛 บัค</button>
                  <button type="button" className={`fab-type ${type === "suggestion" ? "on" : ""}`} onClick={() => setType("suggestion")}>💡 แนะนำ</button>
                </div>
                <label className="fab-label">หัวข้อ
                  <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200}
                    placeholder={type === "bug" ? "เช่น กดติ๊ก checklist แล้วไม่บันทึก" : "เช่น อยากให้มีปุ่มลัดไปหน้า stock"} />
                </label>
                <label className="fab-label">รายละเอียด (ไม่บังคับ)
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} rows={3}
                    placeholder="ทำขั้นไหน เกิดอะไรขึ้น ควรเป็นยังไง (ใส่ชื่อ/เบอร์ได้ถ้าอยากให้ติดต่อกลับ)" />
                </label>
                {error && <p className="fab-err">{error}</p>}
                <button className="fab-send btn-cute" onClick={send} disabled={busy || !title.trim()}>
                  {busy ? "กำลังส่ง…" : "ส่ง"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
