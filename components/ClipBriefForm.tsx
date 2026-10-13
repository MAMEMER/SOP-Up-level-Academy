"use client";

// ฟอร์มบรีฟคลิป: เลือกโฟลเดอร์ Footage ที่รอตัด (หรือพิมพ์เอง) → บอกเป้าหมาย ฮุก ของเด็ด สิ่งที่ห้ามใส่
// ข้อความบนจอ อารมณ์เพลง. ร่างเก็บใน localStorage ตลอด ปิดหน้าไปกลับมาก็ยังอยู่ — ล้างเมื่อส่งสำเร็จ
// หรือกด "ล้างฟอร์ม".

import { useEffect, useRef, useState } from "react";
import { FolderOpen, RefreshCw, RotateCcw, Send } from "lucide-react";
import { SubmitStatus, type SubmitState } from "./SubmitStatus.tsx";
import { CLIP_GOALS, MUSIC_MOODS, fileCount, normalizeFolderKey, type ClipGoal, type MusicMood } from "../lib/clip-briefs.ts";

const DRAFT_KEY = "sop-clip-brief-draft-v1";

type Draft = {
  folder: string;
  goal: ClipGoal | "";
  goalNote: string;
  hook: string;
  highlights: string;
  mustAvoid: string;
  textIdeas: string;
  musicMood: MusicMood;
};

type PendingRow = { folder: string; folderKey: string; files: number | string[]; firstSeen: string; hasBrief: boolean };

const blankDraft = (folder = ""): Draft => ({
  folder,
  goal: "",
  goalNote: "",
  hook: "",
  highlights: "",
  mustAvoid: "",
  textIdeas: "",
  musicMood: "ai_pick"
});

function seenLabel(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  return new Date(time).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });
}

export function ClipBriefForm({
  initialFolder,
  submitterName,
  canSubmit
}: {
  initialFolder: string;
  submitterName: string;
  canSubmit: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(() => blankDraft(initialFolder));
  const [pending, setPending] = useState<PendingRow[] | null>(null);
  const [pendingError, setPendingError] = useState(false);
  const [state, setState] = useState<SubmitState>("not_sent");
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [sentFolder, setSentFolder] = useState("");
  const [error, setError] = useState("");
  const restored = useRef(false);

  // คืนร่างเดิม — แต่ถ้าเปิดมาจากลิงก์ ?folder= ให้โฟลเดอร์จากลิงก์ชนะ
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = { ...blankDraft(), ...(JSON.parse(saved) as Partial<Draft>) };
        setDraft(initialFolder ? { ...parsed, folder: initialFolder } : parsed);
      }
    } catch {
      /* ร่างเสีย/อ่านไม่ได้ — เริ่มใหม่ */
    }
  }, [initialFolder]);

  useEffect(() => {
    if (!restored.current) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* private mode */
    }
  }, [draft]);

  async function loadPending() {
    setPendingError(false);
    try {
      const res = await fetch("/api/clip-briefs/pending", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { folders?: PendingRow[] };
      setPending(Array.isArray(data.folders) ? data.folders : []);
    } catch {
      setPendingError(true);
      setPending([]);
    }
  }

  useEffect(() => {
    void loadPending();
  }, []);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    if (state === "sent" || state === "failed") setState("not_sent");
  };

  function reset() {
    setDraft(blankDraft());
    setError("");
    setState("not_sent");
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }

  const missing = !draft.folder.trim()
    ? "เลือกหรือพิมพ์ชื่อโฟลเดอร์"
    : !draft.goal
      ? "เลือกว่าคลิปนี้เอาไปทำอะไร"
      : draft.goal === "other" && !draft.goalNote.trim()
        ? "พิมพ์ว่าอยากได้แนวไหน"
        : !draft.hook.trim()
          ? "ใส่ฮุกเปิดคลิป"
          : "";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (missing || !canSubmit) return;
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/clip-briefs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft)
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; createdAt?: string; detail?: string; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.detail || data.error || `ส่งไม่สำเร็จ (${res.status})`);
      setSentFolder(draft.folder.trim());
      setSentAt(data.createdAt ?? new Date().toISOString());
      setDraft(blankDraft());
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      setState("sent");
      void loadPending();
    } catch (caught) {
      setState("failed");
      setError(caught instanceof Error ? caught.message : "ส่งไม่สำเร็จ");
    }
  }

  const selectedKey = normalizeFolderKey(draft.folder);

  return (
    <form className="clip-brief__form" onSubmit={submit}>
      {state === "sent" ? (
        <div className="clip-brief__done">
          <SubmitStatus state="sent" sentAt={sentAt} hint={`โฟลเดอร์ "${sentFolder}" · บันทึกในชื่อ ${submitterName}`} />
        </div>
      ) : null}

      <fieldset className="clip-brief__field">
        <legend>
          โฟลเดอร์ใน Drive <span className="clip-brief__req">จำเป็น</span>
        </legend>
        <p className="clip-brief__hint">ชื่อโฟลเดอร์ย่อยใต้ Footage ที่อัปคลิปไว้</p>
        <div className="clip-brief__pending-head">
          <span>โฟลเดอร์ที่รอตัด</span>
          <button type="button" className="clip-brief__icon-btn" onClick={() => void loadPending()} aria-label="โหลดรายการโฟลเดอร์ใหม่">
            <RefreshCw size={18} aria-hidden />
          </button>
        </div>
        {pending === null ? (
          <p className="clip-brief__hint">กำลังโหลด…</p>
        ) : pending.length ? (
          <div className="clip-brief__folders" role="radiogroup" aria-label="โฟลเดอร์ที่รอตัด">
            {pending.map((row) => {
              const on = row.folderKey === selectedKey;
              const count = fileCount(row.files);
              const seen = seenLabel(row.firstSeen);
              return (
                <button
                  key={row.folderKey || row.folder}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`clip-brief__folder${on ? " is-on" : ""}`}
                  onClick={() => set("folder", row.folder)}
                >
                  <FolderOpen size={18} aria-hidden />
                  <span className="clip-brief__folder-name">{row.folder}</span>
                  <span className="clip-brief__folder-meta">
                    {count ? `${count} ไฟล์` : ""}
                    {count && seen ? " · " : ""}
                    {seen}
                  </span>
                  {row.hasBrief ? (
                    <span className="clip-brief__badge clip-brief__badge--ok">มีบรีฟแล้ว</span>
                  ) : (
                    <span className="clip-brief__badge">ยังไม่มีบรีฟ</span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="clip-brief__hint">
            {pendingError ? "โหลดรายการโฟลเดอร์ไม่ได้ — พิมพ์ชื่อเองด้านล่างได้" : "ตอนนี้ไม่มีโฟลเดอร์ที่รอตัด — พิมพ์ชื่อเองด้านล่างได้"}
          </p>
        )}
        <input
          value={draft.folder}
          onChange={(e) => set("folder", e.target.value)}
          placeholder="หรือพิมพ์ชื่อโฟลเดอร์ เช่น เปิดซอง Riftbound 12 ต.ค."
          aria-label="ชื่อโฟลเดอร์"
          maxLength={200}
        />
      </fieldset>

      <fieldset className="clip-brief__field">
        <legend>
          คลิปนี้อยากให้ออกมาแนวไหน / เอาไปทำอะไร <span className="clip-brief__req">จำเป็น</span>
        </legend>
        <div className="clip-brief__chips" role="radiogroup" aria-label="แนวคลิป">
          {(Object.keys(CLIP_GOALS) as ClipGoal[]).map((goal) => (
            <button
              key={goal}
              type="button"
              role="radio"
              aria-checked={draft.goal === goal}
              className={draft.goal === goal ? "is-on" : undefined}
              onClick={() => set("goal", goal)}
            >
              {CLIP_GOALS[goal]}
            </button>
          ))}
        </div>
        <input
          value={draft.goalNote}
          onChange={(e) => set("goalNote", e.target.value)}
          placeholder={draft.goal === "other" ? "พิมพ์ว่าอยากได้แนวไหน (จำเป็น)" : "อธิบายเพิ่ม (ไม่บังคับ) เช่น ลง TikTok ร้าน"}
          aria-label="อธิบายแนวคลิปเพิ่ม"
          maxLength={300}
        />
      </fieldset>

      <label className="clip-brief__field">
        <span className="clip-brief__label">
          ฮุกเปิดคลิป <span className="clip-brief__req">จำเป็น</span>
        </span>
        <span className="clip-brief__hint">อะไรเปิดคลิป และประมาณวินาทีไหน / ไฟล์ไหน</span>
        <textarea
          rows={3}
          value={draft.hook}
          onChange={(e) => set("hook", e.target.value)}
          placeholder="เช่น ตอนเปิดเจอ Jinx alt art ไฟล์ IMG_0412 ประมาณวินาทีที่ 40"
          maxLength={2000}
        />
      </label>

      <label className="clip-brief__field">
        <span className="clip-brief__label">ของเด็ด / ช่วงสำคัญที่ต้องมี</span>
        <textarea
          rows={3}
          value={draft.highlights}
          onChange={(e) => set("highlights", e.target.value)}
          placeholder="เช่น ได้ Jinx alt art ซองที่ 3 ประมาณนาทีที่ 1 · ลูกค้าดีใจตอนท้าย"
          maxLength={2000}
        />
      </label>

      <label className="clip-brief__field">
        <span className="clip-brief__label">ห้ามใส่ / ตัดทิ้ง</span>
        <textarea
          rows={2}
          value={draft.mustAvoid}
          onChange={(e) => set("mustAvoid", e.target.value)}
          placeholder="ไม่บังคับ เช่น ช่วงที่เห็นหน้าลูกค้าชัด · เสียงคุยเรื่องราคา"
          maxLength={2000}
        />
      </label>

      <label className="clip-brief__field">
        <span className="clip-brief__label">ข้อความ / คำพูดที่อยากให้ขึ้นจอ</span>
        <textarea
          rows={2}
          value={draft.textIdeas}
          onChange={(e) => set("textIdeas", e.target.value)}
          placeholder="ไม่บังคับ เช่น 'เปิด 10 ซอง ได้อะไรบ้าง?'"
          maxLength={2000}
        />
      </label>

      <label className="clip-brief__field">
        <span className="clip-brief__label">อารมณ์เพลง</span>
        <select value={draft.musicMood} onChange={(e) => set("musicMood", e.target.value as MusicMood)}>
          {(Object.keys(MUSIC_MOODS) as MusicMood[]).map((mood) => (
            <option key={mood} value={mood}>
              {MUSIC_MOODS[mood]}
            </option>
          ))}
        </select>
      </label>

      {error ? <p className="clip-brief__error">{error}</p> : null}
      {!canSubmit ? <p className="clip-brief__hint">กำลังดูในชื่อคนอื่น — ส่งบรีฟไม่ได้</p> : null}

      <div className="clip-brief__actions">
        <button type="submit" className="clip-brief__submit" disabled={Boolean(missing) || state === "sending" || !canSubmit}>
          <Send size={18} aria-hidden />
          ส่งบรีฟ
        </button>
        <button type="button" className="clip-brief__secondary" onClick={reset}>
          <RotateCcw size={16} aria-hidden />
          ล้างฟอร์ม
        </button>
      </div>
      {state !== "sent" ? (
        <SubmitStatus state={state} compact hint={missing && state === "not_sent" ? `ยังขาด: ${missing}` : `บันทึกในชื่อ ${submitterName}`} />
      ) : null}
    </form>
  );
}
