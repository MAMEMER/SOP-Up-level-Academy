"use client";

import { useCallback, useEffect, useState } from "react";
import { EvidencePhotosInput } from "./EvidencePhotosInput.tsx";
import {
  MAX_NOTE_IMAGES,
  MAX_NOTE_LENGTH,
  noteDateLabel,
  notesForStaff,
  unacknowledgedCount,
  validateNoteDraft,
  type CoachingNote
} from "../lib/coaching-notes.ts";

async function api(body: Record<string, unknown>): Promise<void> {
  const res = await fetch("/api/coaching-notes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const detail = await res.json().then((d) => (d as { detail?: string }).detail).catch(() => undefined);
    if (detail) throw new Error(detail);
    if (res.status === 403) throw new Error("บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้");
    throw new Error("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
}

/**
 * คำแนะนำจากหัวหน้า — อยู่บนหน้าประเมินผลงาน (/my-review).
 * พนักงานเห็นคำแนะนำของตัวเองพร้อมรูป และกดรับทราบได้ · เจ้าของ/แอดมินเห็นช่องเขียนถึงคนที่
 * กำลังเปิดดูอยู่ (เลือกคนจาก dropdown ด้านบนของหน้า) แนบรูปได้สูงสุด 3 รูป.
 */
export function CoachingNotes({
  staffCode,
  staffName,
  branch,
  period,
  isAdmin,
  readOnly = false
}: {
  staffCode: string;
  staffName: string;
  branch: string;
  period: string;
  isAdmin: boolean;
  /** ระหว่าง "ดูเป็นคนนี้" ห้ามเขียน/กดรับทราบแทนเจ้าตัว */
  readOnly?: boolean;
}) {
  const [notes, setNotes] = useState<CoachingNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/coaching-notes?staffCode=${encodeURIComponent(staffCode)}`, { cache: "no-store" });
      const data = res.ok ? ((await res.json()) as { notes?: CoachingNote[] }) : { notes: [] };
      setNotes(notesForStaff(data.notes || [], staffCode));
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [staffCode]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send() {
    const images = photos.split("\n").map((url) => url.trim()).filter(Boolean);
    const invalid = validateNoteDraft({ staffCode, note, images });
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api({ action: "createNote", staffCode, branch, period, note: note.trim(), images });
      setNote("");
      setPhotos("");
      setSent(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งคำแนะนำไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function acknowledge(id: string) {
    try {
      await api({ action: "acknowledgeNote", id });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    }
  }

  async function remove(id: string) {
    try {
      await api({ action: "deleteNote", id });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  }

  const pending = unacknowledgedCount(notes);

  return (
    <section className="coaching">
      <div className="coaching__head">
        <p className="self-review__label">คำแนะนำจากหัวหน้า</p>
        {pending > 0 ? <span className="coaching__pending">ยังไม่ได้อ่าน {pending}</span> : null}
      </div>

      {isAdmin && !readOnly ? (
        <div className="coaching__form">
          <label htmlFor="coaching-note">เขียนคำแนะนำถึง {staffName}</label>
          <textarea
            id="coaching-note"
            rows={3}
            value={note}
            maxLength={MAX_NOTE_LENGTH}
            onChange={(event) => {
              setNote(event.target.value);
              setSent(false);
            }}
            placeholder="เช่น รอบนี้ส่ง checklist ช้าบ่อย ลองกดส่งทีละหัวข้อทันทีที่ทำเสร็จ · แนบรูปตัวอย่างที่ถูกต้องได้"
          />
          <EvidencePhotosInput value={photos} onChange={setPhotos} max={MAX_NOTE_IMAGES} label="แนบรูปประกอบ (ถ้ามี)" disabled={busy} />
          {error ? <p className="project-progress-form__error">{error}</p> : null}
          <div className="coaching__actions">
            <button type="button" className="primary-action" onClick={send} disabled={busy || !note.trim()}>
              {busy ? "กำลังส่ง…" : "ส่งคำแนะนำ"}
            </button>
            {sent ? <span className="coaching__sent">ส่งแล้ว — พนักงานเห็นในหน้านี้ของเขา</span> : null}
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="self-review__empty">กำลังโหลด…</p>
      ) : notes.length === 0 ? (
        <p className="self-review__empty">
          {isAdmin ? "ยังไม่เคยส่งคำแนะนำให้คนนี้" : "ยังไม่มีคำแนะนำจากหัวหน้าในรอบนี้"}
        </p>
      ) : (
        <ul className="coaching__list">
          {notes.map((item) => (
            <li key={item.id} className={item.acknowledgedAt ? "coaching__item" : "coaching__item is-new"}>
              <p className="coaching__meta">
                <span>{noteDateLabel(item.createdAt)}</span>
                <span>จาก {item.createdByName || item.createdBy}</span>
                {item.acknowledgedAt ? <span className="coaching__read">อ่านแล้ว</span> : null}
              </p>
              <p className="coaching__note">{item.note}</p>
              {item.images?.length ? (
                <div className="coaching__photos">
                  {item.images.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      {/* รูปหน้างานจากหัวหน้า — กดเพื่อดูเต็ม */}
                      <img src={url} alt="รูปประกอบคำแนะนำจากหัวหน้า" loading="lazy" />
                    </a>
                  ))}
                </div>
              ) : null}
              <div className="coaching__item-actions">
                {!item.acknowledgedAt && !readOnly && !isAdmin ? (
                  <button type="button" className="coaching__ack" onClick={() => acknowledge(item.id)}>
                    รับทราบแล้ว
                  </button>
                ) : null}
                {isAdmin && !readOnly ? (
                  <button type="button" className="coaching__del" onClick={() => remove(item.id)}>
                    ลบ
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
