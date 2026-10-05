"use client";

// ของมาถึงร้านแต่ยังไม่มีออเดอร์ (เจ้าของร้านลืมลง) — แอดมินลงไว้ก่อน: รูปหน้ากล่อง/ของในกล่อง
// + ชื่อผู้ส่งบนกล่อง. เจ้าของร้านได้ Telegram แล้วมาจับคู่ออเดอร์เอง.
// ร่างเก็บใน localStorage ปิดหน้าไปก็ไม่หาย — ล้างเมื่อบันทึกสำเร็จหรือกด "ล้างฟอร์ม".

import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { EvidencePhotosInput } from "./EvidencePhotosInput.tsx";
import { branchConfigs } from "../lib/store-config.ts";
import { DEFAULT_PARCEL_BRANCH } from "../lib/parcel-orders.ts";
import { receiveUnmatchedParcel, type UnmatchedDraft } from "../lib/parcel-orders-store.ts";

const DRAFT_KEY = "sop-parcel-receive-draft-v1";

const blank = (branch?: string): UnmatchedDraft => ({
  branch: branch || DEFAULT_PARCEL_BRANCH,
  seller: "",
  trackingNumber: "",
  note: "",
  arrivalPhotos: []
});

export function ParcelReceiveForm({ branch, onSaved, onCancel }: { branch?: string; onSaved: () => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<UnmatchedDraft>(blank(branch));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) setDraft({ ...blank(branch), ...(JSON.parse(saved) as Partial<UnmatchedDraft>) });
    } catch {
      /* ร่างเสีย — เริ่มใหม่ */
    }
  }, [branch]);

  useEffect(() => {
    if (!restored.current) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* private mode */
    }
  }, [draft]);

  const set = <K extends keyof UnmatchedDraft>(key: K, value: UnmatchedDraft[K]) => setDraft((prev) => ({ ...prev, [key]: value }));

  function reset() {
    setDraft(blank(branch));
    setError("");
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await receiveUnmatchedParcel(draft);
      reset();
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="parcel-form" onSubmit={submit}>
      <p className="parcel-board__hint">
        ของมาถึงแต่หาในรายการไม่เจอ — ลงไว้ก่อนได้เลย ถ่ายรูปหน้ากล่องกับของข้างใน เดี๋ยวเจ้าของร้านมาจับคู่ว่าเป็นออเดอร์ไหน
        แล้วค่อยเช็คของทีละใบ
      </p>
      <div className="parcel-form__photos">
        <EvidencePhotosInput
          value={draft.arrivalPhotos.join("\n")}
          onChange={(value) => set("arrivalPhotos", value.split("\n").filter(Boolean))}
          max={10}
          label="รูปหน้ากล่อง + ของในกล่อง (อย่างน้อย 1 รูป)"
        />
      </div>
      <div className="parcel-form__grid">
        <label>
          <span>ชื่อผู้ส่งบนกล่อง</span>
          <input value={draft.seller} onChange={(e) => set("seller", e.target.value)} placeholder="ไม่รู้ก็เว้นไว้" />
        </label>
        <label>
          <span>เลขพัสดุ</span>
          <input value={draft.trackingNumber} onChange={(e) => set("trackingNumber", e.target.value)} placeholder="ไม่บังคับ" />
        </label>
        <label>
          <span>ของถึงสาขา</span>
          <select value={draft.branch} onChange={(e) => set("branch", e.target.value)}>
            {branchConfigs.map((option) => (
              <option key={option.key} value={option.key}>
                {option.shortName}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="parcel-form__wide">
        <span>ในกล่องมีอะไร</span>
        <textarea value={draft.note} onChange={(e) => set("note", e.target.value)} rows={2} placeholder="เช่น การ์ด 3 ใบ Pikachu ex, Charizard…" />
      </label>

      {error ? <p className="parcel-board__error" role="alert">{error}</p> : null}

      <div className="parcel-form__actions">
        <button type="submit" className="parcel-board__new" disabled={busy || !draft.arrivalPhotos.length}>
          {busy ? "กำลังบันทึก…" : "ลงพัสดุ แจ้งเจ้าของร้าน"}
        </button>
        <button type="button" className="parcel-form__secondary" onClick={onCancel}>
          ปิด
        </button>
        <button type="button" className="parcel-form__secondary" onClick={reset}>
          <RotateCcw size={15} aria-hidden /> ล้างฟอร์ม
        </button>
      </div>
    </form>
  );
}
