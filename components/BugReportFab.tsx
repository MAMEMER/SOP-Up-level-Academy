"use client";

// Floating "แจ้งบัค / แนะนำ" button + modal — same idea + triage queue as the guild
// app (writes to Firestore `tickets`, source:'sop'). Plain CSS (this app has no
// Tailwind); styled with the Guild design tokens. No login required.

import { useEffect, useRef, useState } from "react";
import { OPEN_BUG_EVENT } from "./SupportFab.tsx";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase-client.ts";
import { Bug, CircleCheck, Lightbulb } from "lucide-react";

type TicketType = "bug" | "suggestion";
type Status = "idle" | "submitting" | "sent";
type Shot = { id: string; dataUrl: string };

// Image attachments — same client-side pattern as the guild BugReportFab:
// compress to a JPEG data URL and ride it along inside the Firestore ticket doc
// (no Storage upload, no extra rules, no login). 3 × ~300KB keeps the doc safely
// under Firestore's 1MB document limit.
const MAX_FILES = 3;
const IMG_BUDGET = 300 * 1024; // per data-URL length (chars ≈ bytes)
const IMG_MAX_DIM = 1280;

function compressImage(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith("image/")) { resolve(null); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width, h = img.height;
      if (w > IMG_MAX_DIM || h > IMG_MAX_DIM) {
        const r = Math.min(IMG_MAX_DIM / w, IMG_MAX_DIM / h);
        w = Math.round(w * r); h = Math.round(h * r);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const cx = canvas.getContext("2d");
      if (!cx) { resolve(null); return; }
      cx.drawImage(img, 0, 0, w, h);
      let q = 0.72, data = "";
      do {
        try { data = canvas.toDataURL("image/jpeg", q); }
        catch { resolve(null); return; }
        q -= 0.12;
      } while (data.length > IMG_BUDGET && q > 0.18);
      resolve(data.length > IMG_BUDGET ? null : data);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

export function BugReportFab() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_BUG_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_BUG_EVENT, onOpen);
  }, []);
  const [type, setType] = useState<TicketType>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [shots, setShots] = useState<Shot[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setType("bug"); setTitle(""); setDescription(""); setStatus("idle"); setError(""); setShots([]);
  }
  function close() { setOpen(false); setTimeout(reset, 250); }

  async function addFiles(list: FileList | null) {
    if (!list) return;
    let picked = Array.from(list);
    const room = MAX_FILES - shots.length;
    if (picked.length > room) {
      setError(`แนบรูปได้สูงสุด ${MAX_FILES} รูป`);
      picked = picked.slice(0, room);
    } else { setError(""); }
    for (const file of picked) {
      const dataUrl = await compressImage(file);
      if (!dataUrl) { setError("มีรูปที่ใหญ่/เปิดไม่ได้ — ลองรูปอื่น"); continue; }
      setShots((prev) => (prev.length >= MAX_FILES ? prev : [...prev, { id: `${Date.now()}_${Math.round(Math.random() * 1e6)}`, dataUrl }]));
    }
  }
  function removeShot(id: string) {
    setShots((prev) => prev.filter((s) => s.id !== id));
  }

  async function send() {
    setError("");
    // Title optional: allow a report that's just a screenshot + short note.
    const hasContent = !!(title.trim() || description.trim() || shots.length);
    if (!hasContent) { setError("พิมพ์รายละเอียด หรือแนบรูปสักอย่าง"); return; }
    const finalTitle = (title.trim() || description.trim().split("\n")[0] || "แจ้งปัญหา").slice(0, 200);
    setStatus("submitting");
    try {
      await addDoc(collection(db, "tickets"), {
        type,
        title: finalTitle,
        description: description.trim().slice(0, 4000),
        attachments: shots.map((s) => s.dataUrl),
        attachmentCount: shots.length,
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
  const canSend = !!(title.trim() || description.trim() || shots.length);

  return (
    <>

      {open && (
        <div className="fab-overlay" onClick={close}>
          <div className="fab-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fab-modal-head">
              <strong>แจ้งบัค / แนะนำ</strong>
              <button className="fab-x" aria-label="ปิด" onClick={close}>✕</button>
            </div>
            <p className="fab-sub">เว็บเพิ่งเปิด เจอปัญหาหรืออยากแนะนำ แจ้งได้เลย — ทีมงานเห็นทันที</p>

            {status === "sent" ? (
              <div className="fab-sent"><CircleCheck className="ui-inline-icon" size={16} aria-hidden="true" /> ส่งแล้ว ขอบคุณ! ทีมงานจะรีบดูให้</div>
            ) : (
              <div className="fab-body">
                <div className="fab-typerow">
                  <button type="button" className={`fab-type ${type === "bug" ? "on" : ""}`} onClick={() => setType("bug")}><Bug className="ui-inline-icon" size={14} aria-hidden="true" /> บัค</button>
                  <button type="button" className={`fab-type ${type === "suggestion" ? "on" : ""}`} onClick={() => setType("suggestion")}><Lightbulb className="ui-inline-icon" size={14} aria-hidden="true" /> แนะนำ</button>
                </div>
                <label className="fab-label">หัวข้อ (ไม่บังคับ)
                  <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200}
                    placeholder={type === "bug" ? "เช่น กดติ๊ก checklist แล้วไม่บันทึก" : "เช่น อยากให้มีปุ่มลัดไปหน้า stock"} />
                </label>
                <label className="fab-label">รายละเอียด (ไม่บังคับ)
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} rows={3}
                    placeholder="ทำขั้นไหน เกิดอะไรขึ้น ควรเป็นยังไง (ใส่ชื่อ/เบอร์ได้ถ้าอยากให้ติดต่อกลับ)" />
                </label>

                <div className="fab-label">แนบรูป (ไม่บังคับ · สูงสุด {MAX_FILES})
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
                  />
                  <div className="fab-shots">
                    {shots.map((s) => (
                      <div key={s.id} className="fab-shot">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.dataUrl} alt="รูปที่แนบ" />
                        <button type="button" className="fab-shot-x" aria-label="ลบรูป" onClick={() => removeShot(s.id)}>✕</button>
                      </div>
                    ))}
                    {shots.length < MAX_FILES && (
                      <button type="button" className="fab-shot-add" aria-label="เพิ่มรูป" onClick={() => fileRef.current?.click()}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <span className="fab-hint">แนบ screenshot ที่เจอปัญหา ช่วยให้ทีมแก้ได้เร็วขึ้น</span>
                </div>

                {error && <p className="fab-err">{error}</p>}
                <button className="fab-send btn-cute" onClick={send} disabled={busy || !canSend}>
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
